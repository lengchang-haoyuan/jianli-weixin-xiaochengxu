const crypto = require("node:crypto");
const {
  PRIVACY_VERSION,
  QUESTIONNAIRE_VERSION,
  STANDARD_VERSION,
  RESUME_TEMPLATES,
} = require("./constants");
const { AppError } = require("./errors");
const { validateGeneratedPackages } = require("./generation-validator");
const { getShanghaiDate } = require("./identity");
const { buildFactCatalog, prepareResumeForModel } = require("./privacy");
const { QUESTION_IDS, calculateQuestionnaireScores } = require("./questionnaire");
const { scoreRoleMappings, toCompactStandard } = require("./role-scoring");
const {
  validateAnalysisId,
  validateConfirmResumeVersion,
  validateGenerationRequest,
  validatePreferences,
  validateQuestionnaire,
  validateRenderResumeFiles,
  validateResumeDraft,
  validateTaskId,
} = require("./validators");

const toPublicAnalysis = (analysis) => ({
  analysisId: analysis.analysisId,
  matches: analysis.matches,
  standardVersion: analysis.standardVersion,
});

const toPublicVersion = (version) => ({
  contactBlock: version.contactBlock,
  directionId: version.directionId,
  greetings: version.greetings,
  language: version.language,
  resumeTitle: version.resumeTitle,
  roleName: version.roleName,
  revision: Number.isInteger(version.revision) && version.revision >= 1 ? version.revision : 1,
  sections: version.sections,
  status: version.status === "CONFIRMED" ? "CONFIRMED" : "DRAFT",
  versionId: version.versionId,
});

class CareerService {
  constructor(repository, modelProvider, documentRenderer = null, exportFileStore = null) {
    this.repository = repository;
    this.modelProvider = modelProvider;
    this.documentRenderer = documentRenderer;
    this.exportFileStore = exportFileStore;
  }

  async requireReadyUser(ownerId) {
    const user = await this.repository.getUser(ownerId);
    if (!user || user.consentVersion !== PRIVACY_VERSION) {
      throw new AppError("CONSENT_REQUIRED", "请先阅读并同意当前隐私说明。");
    }
    if (!user.confirmedResume || typeof user.confirmedResume.text !== "string") {
      throw new AppError("CONFIRMED_RESUME_REQUIRED", "请先上传并确认简历事实。");
    }
    return user;
  }

  async savePreferences(ownerId, payload) {
    const user = await this.requireReadyUser(ownerId);
    const input = validatePreferences(payload);
    await this.repository.savePreferences(ownerId, { ...input, mode: user.mode });
    return { saved: true, ...input, mode: user.mode };
  }

  async saveQuestionnaire(ownerId, payload) {
    await this.requireReadyUser(ownerId);
    const input = validateQuestionnaire(payload, QUESTION_IDS);
    const scores = calculateQuestionnaireScores(input.answers, input.skipped);
    await this.repository.saveQuestionnaire(ownerId, {
      ...input,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      scores,
    });
    return { saved: true, skipped: input.skipped };
  }

  async analyzeRoleMatches(ownerId) {
    const [user, preferences, questionnaire] = await Promise.all([
      this.requireReadyUser(ownerId),
      this.repository.getPreferences(ownerId),
      this.repository.getQuestionnaire(ownerId),
    ]);
    if (!preferences) {
      throw new AppError("PREFERENCES_REQUIRED", "请先设置求职方向和输出语言。");
    }
    if (!questionnaire || questionnaire.questionnaireVersion !== QUESTIONNAIRE_VERSION) {
      throw new AppError("QUESTIONNAIRE_REQUIRED", "请先完成或跳过工作方式问卷。");
    }

    const prepared = prepareResumeForModel(user.confirmedResume.text);
    if (prepared.sanitizedText.length < 20) {
      throw new AppError("RESUME_TEXT_TOO_SHORT", "可用于岗位分析的简历事实过少，请返回重新确认。");
    }
    const modelResponse = await this.modelProvider.analyzeRoles({
      mode: user.mode,
      questionnaireScores: questionnaire.scores,
      rawIntent: preferences.rawIntent,
      resumeText: prepared.sanitizedText,
      standard: toCompactStandard(),
    });
    const matches = scoreRoleMappings(
      modelResponse.data,
      user.mode,
      questionnaire.scores,
      prepared.sanitizedText,
    );
    const analysis = {
      analysisId: crypto.randomUUID(),
      language: preferences.language,
      matches,
      mode: user.mode,
      questionnaireSkipped: questionnaire.skipped,
      standardVersion: STANDARD_VERSION,
      tokenUsage: modelResponse.usage,
    };
    await this.repository.saveAnalysis(ownerId, analysis);
    return toPublicAnalysis(analysis);
  }

  async getRoleAnalysis(ownerId, payload) {
    await this.requireReadyUser(ownerId);
    const analysis = await this.repository.getAnalysis(validateAnalysisId(payload.analysisId));
    if (!analysis || analysis.ownerId !== ownerId) {
      throw new AppError("RESOURCE_FORBIDDEN", "无权访问该岗位分析结果。");
    }
    return toPublicAnalysis(analysis);
  }

  async toPublicTask(ownerId, task) {
    const versions = task.status === "COMPLETED" && Array.isArray(task.versionIds)
      ? await this.repository.getVersions(task.versionIds, ownerId)
      : [];
    return {
      errorCode: task.errorCode || null,
      status: task.status,
      taskId: task.taskId,
      versions: versions.map(toPublicVersion),
    };
  }

  async generateResumePackage(ownerId, payload) {
    const input = validateGenerationRequest(payload);
    const taskId = `task_${crypto
      .createHash("sha256")
      .update(`${ownerId}:${input.idempotencyKey}`, "utf8")
      .digest("hex")
      .slice(0, 40)}`;
    const existingTask = await this.repository.getTask(taskId);
    if (existingTask) {
      if (existingTask.ownerId !== ownerId) {
        throw new AppError("RESOURCE_FORBIDDEN", "无权访问该生成任务。");
      }
      return this.toPublicTask(ownerId, existingTask);
    }

    const [user, analysis] = await Promise.all([
      this.requireReadyUser(ownerId),
      this.repository.getAnalysis(input.analysisId),
    ]);
    if (!analysis || analysis.ownerId !== ownerId) {
      throw new AppError("RESOURCE_FORBIDDEN", "无权使用该岗位分析结果。");
    }
    const matchById = new Map(analysis.matches.map((match) => [match.directionId, match]));
    const selectedMatches = input.selectedDirectionIds.map((directionId) => matchById.get(directionId));
    if (selectedMatches.some((match) => !match)) {
      throw new AppError("INVALID_DIRECTION_SELECTION", "所选方向不属于当前分析结果。");
    }

    const date = getShanghaiDate();
    const reserved = await this.repository.reserveGeneration(ownerId, date, {
      analysisId: input.analysisId,
      selectedDirectionIds: input.selectedDirectionIds,
      taskId,
    });
    if (!reserved) {
      const task = await this.repository.getTask(taskId);
      return this.toPublicTask(ownerId, task);
    }

    try {
      const prepared = prepareResumeForModel(user.confirmedResume.text);
      const facts = buildFactCatalog(prepared.sanitizedText);
      const modelResponse = await this.modelProvider.generateResumePackages({
        directions: selectedMatches.map((match) => ({
          directionId: match.directionId,
          evidence: match.evidence,
          gaps: match.gaps,
          name: match.name,
        })),
        facts,
        language: analysis.language,
        mode: analysis.mode,
      });
      const packages = validateGeneratedPackages(
        modelResponse.data,
        selectedMatches,
        facts,
        analysis.language,
      );
      const versions = packages.map((item) => ({
        ...item,
        contactBlock: prepared.contactBlock,
        standardVersion: STANDARD_VERSION,
        versionId: crypto.randomUUID(),
      }));
      await this.repository.completeGeneration(
        ownerId,
        date,
        taskId,
        versions,
        modelResponse.usage,
      );
      return this.toPublicTask(ownerId, await this.repository.getTask(taskId));
    } catch (error) {
      await this.repository.failGeneration(
        ownerId,
        date,
        taskId,
        error instanceof AppError ? error.code : "INTERNAL_ERROR",
      );
      throw error;
    }
  }

  async getGenerationTask(ownerId, payload) {
    await this.requireReadyUser(ownerId);
    const task = await this.repository.getTask(validateTaskId(payload.taskId));
    if (!task || task.ownerId !== ownerId) {
      throw new AppError("RESOURCE_FORBIDDEN", "无权访问该生成任务。");
    }
    return this.toPublicTask(ownerId, task);
  }

  async updateResumeDraft(ownerId, payload) {
    await this.requireReadyUser(ownerId);
    const version = await this.repository.updateResumeDraft(
      ownerId,
      validateResumeDraft(payload),
    );
    return toPublicVersion(version);
  }

  async confirmResumeVersion(ownerId, payload) {
    await this.requireReadyUser(ownerId);
    const version = await this.repository.confirmResumeVersion(
      ownerId,
      validateConfirmResumeVersion(payload),
    );
    return toPublicVersion(version);
  }

  async renderResumeFiles(ownerId, payload) {
    await this.requireReadyUser(ownerId);
    const input = validateRenderResumeFiles(payload);
    const version = await this.repository.getVersion(input.versionId);
    if (!version || version.ownerId !== ownerId) {
      throw new AppError("RESOURCE_FORBIDDEN", "无权导出该简历版本。");
    }
    if (version.status !== "CONFIRMED") {
      throw new AppError("RESUME_VERSION_NOT_CONFIRMED", "请先确认简历内容，再选择模板导出。");
    }
    if (!this.documentRenderer || !this.exportFileStore) {
      throw new AppError("DOCUMENT_RENDER_UNAVAILABLE", "文档渲染服务暂时不可用，请稍后重试。");
    }

    const template = RESUME_TEMPLATES[input.templateId];
    const rendered = await this.documentRenderer.render(version, input.templateId);
    const stored = await this.exportFileStore.save(
      ownerId,
      version,
      template,
      input.templateId,
      rendered,
    );
    return {
      exportId: `${version.versionId}:${version.revision}:${input.templateId}`,
      files: stored.files,
      greetings: version.greetings,
      pageCount: rendered.pageCount,
      previewUrls: stored.previewUrls,
      resumeTitle: version.resumeTitle,
      roleName: version.roleName,
      templateId: input.templateId,
      templateName: template.name,
      templateVersion: template.version,
      versionId: version.versionId,
    };
  }
}

module.exports = { CareerService };
