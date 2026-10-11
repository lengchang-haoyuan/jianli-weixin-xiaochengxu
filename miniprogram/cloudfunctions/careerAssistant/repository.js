const { COLLECTIONS, DAILY_LIMIT, RESERVATION_TTL_MS } = require("./constants");
const { AppError } = require("./errors");
const { toUsageDocumentId } = require("./identity");

const getErrorMessage = (error) => {
  if (!error || typeof error !== "object") {
    return "";
  }
  return String(error.errMsg || error.message || "");
};

const isDocumentMissing = (error) => /not exist|not found|不存在/i.test(getErrorMessage(error));

const readDocument = async (reference) => {
  try {
    const result = await reference.get();
    return result.data || null;
  } catch (error) {
    if (isDocumentMissing(error)) {
      return null;
    }
    throw error;
  }
};

const getActiveReservations = (usage, nowMs) => {
  const reservations = usage && usage.reservations;
  if (!reservations || typeof reservations !== "object" || Array.isArray(reservations)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(reservations).filter(
      ([taskId, expiresAtMs]) => /^task_[0-9a-f]{40}$/.test(taskId) && Number(expiresAtMs) > nowMs,
    ),
  );
};

const getVersionRevision = (version) =>
  Number.isInteger(version && version.revision) && version.revision >= 1 ? version.revision : 1;

const getVersionStatus = (version) =>
  version && version.status === "CONFIRMED" ? "CONFIRMED" : "DRAFT";

const hasSameDraftContent = (version, input) =>
  version.resumeTitle === input.resumeTitle &&
  Array.isArray(version.greetings) &&
  version.greetings.length === input.greetings.length &&
  version.greetings.every((greeting, index) => greeting === input.greetings[index]) &&
  Array.isArray(version.sections) &&
  version.sections.length === input.sectionTexts.length &&
  version.sections.every((section, index) => section.text === input.sectionTexts[index]);

class CareerRepository {
  constructor(db) {
    this.db = db;
    this.users = db.collection(COLLECTIONS.users);
    this.roleIntents = db.collection(COLLECTIONS.roleIntents);
    this.questionnaireResults = db.collection(COLLECTIONS.questionnaireResults);
    this.matchResults = db.collection(COLLECTIONS.matchResults);
    this.generationTasks = db.collection(COLLECTIONS.generationTasks);
    this.resumeVersions = db.collection(COLLECTIONS.resumeVersions);
  }

  getUser(ownerId) {
    return readDocument(this.users.doc(ownerId));
  }

  getPreferences(ownerId) {
    return readDocument(this.roleIntents.doc(ownerId));
  }

  async savePreferences(ownerId, input) {
    const timestamp = this.db.serverDate();
    await Promise.all([
      this.roleIntents.doc(ownerId).set({
        data: { ownerId, ...input, updatedAt: timestamp },
      }),
      this.users.doc(ownerId).update({
        data: { language: input.language, updatedAt: timestamp },
      }),
    ]);
  }

  getQuestionnaire(ownerId) {
    return readDocument(this.questionnaireResults.doc(ownerId));
  }

  saveQuestionnaire(ownerId, input) {
    return this.questionnaireResults.doc(ownerId).set({
      data: { ownerId, ...input, updatedAt: this.db.serverDate() },
    });
  }

  async saveAnalysis(ownerId, analysis) {
    await this.matchResults.doc(analysis.analysisId).set({
      data: { ownerId, ...analysis, createdAt: this.db.serverDate() },
    });
  }

  getAnalysis(analysisId) {
    return readDocument(this.matchResults.doc(analysisId));
  }

  getTask(taskId) {
    return readDocument(this.generationTasks.doc(taskId));
  }

  getVersion(versionId) {
    return readDocument(this.resumeVersions.doc(versionId));
  }

  async reserveGeneration(ownerId, date, task) {
    const usageId = toUsageDocumentId(ownerId, date);
    const nowMs = Date.now();
    return this.db.runTransaction(async (transaction) => {
      const taskReference = transaction.collection(COLLECTIONS.generationTasks).doc(task.taskId);
      const existingTask = await readDocument(taskReference);
      if (existingTask) {
        return false;
      }

      const usageReference = transaction.collection(COLLECTIONS.dailyUsage).doc(usageId);
      const usage = await readDocument(usageReference);
      const reservations = getActiveReservations(usage, nowMs);
      const usedCount = Number.isInteger(usage && usage.usedCount) ? usage.usedCount : 0;
      if (usedCount + Object.keys(reservations).length >= DAILY_LIMIT) {
        throw new AppError("DAILY_QUOTA_EXCEEDED", "今日 3 次完整生成额度已用完，可明日继续。");
      }
      reservations[task.taskId] = nowMs + RESERVATION_TTL_MS;

      await usageReference.set({
        data: {
          ownerId,
          date,
          usedCount,
          reservedCount: Object.keys(reservations).length,
          reservations,
          updatedAt: this.db.serverDate(),
        },
      });
      await taskReference.set({
        data: {
          ownerId,
          ...task,
          status: "PROCESSING",
          createdAt: this.db.serverDate(),
          updatedAt: this.db.serverDate(),
        },
      });
      return true;
    });
  }

  async completeGeneration(ownerId, date, taskId, versions, usage) {
    const usageId = toUsageDocumentId(ownerId, date);
    await this.db.runTransaction(async (transaction) => {
      const taskReference = transaction.collection(COLLECTIONS.generationTasks).doc(taskId);
      const task = await readDocument(taskReference);
      if (!task || task.ownerId !== ownerId) {
        throw new AppError("RESOURCE_FORBIDDEN", "无权访问该生成任务。");
      }
      if (task.status === "COMPLETED") {
        return;
      }

      const usageReference = transaction.collection(COLLECTIONS.dailyUsage).doc(usageId);
      const usageDocument = await readDocument(usageReference);
      const reservations = getActiveReservations(usageDocument, Date.now());
      if (!Object.hasOwn(reservations, taskId)) {
        throw new AppError("GENERATION_RESERVATION_EXPIRED", "生成时间过长，额度预留已过期，请重新生成。");
      }
      delete reservations[taskId];
      const usedCount = Math.min(
        DAILY_LIMIT,
        (Number.isInteger(usageDocument && usageDocument.usedCount) ? usageDocument.usedCount : 0) + 1,
      );

      const versionIds = [];
      for (const version of versions) {
        versionIds.push(version.versionId);
        await transaction.collection(COLLECTIONS.resumeVersions).doc(version.versionId).set({
          data: {
            ownerId,
            taskId,
            ...version,
            revision: 1,
            status: "DRAFT",
            createdAt: this.db.serverDate(),
            updatedAt: this.db.serverDate(),
          },
        });
      }
      await usageReference.set({
        data: {
          ownerId,
          date,
          usedCount,
          reservedCount: Object.keys(reservations).length,
          reservations,
          updatedAt: this.db.serverDate(),
        },
      });
      await taskReference.update({
        data: {
          status: "COMPLETED",
          versionIds,
          tokenUsage: usage,
          completedAt: this.db.serverDate(),
          updatedAt: this.db.serverDate(),
        },
      });
    });
  }

  async failGeneration(ownerId, date, taskId, errorCode) {
    const usageId = toUsageDocumentId(ownerId, date);
    await this.db.runTransaction(async (transaction) => {
      const usageReference = transaction.collection(COLLECTIONS.dailyUsage).doc(usageId);
      const usage = await readDocument(usageReference);
      const reservations = getActiveReservations(usage, Date.now());
      delete reservations[taskId];
      await usageReference.set({
        data: {
          ownerId,
          date,
          usedCount: Number.isInteger(usage && usage.usedCount) ? usage.usedCount : 0,
          reservedCount: Object.keys(reservations).length,
          reservations,
          updatedAt: this.db.serverDate(),
        },
      });
      const taskReference = transaction.collection(COLLECTIONS.generationTasks).doc(taskId);
      const task = await readDocument(taskReference);
      if (task && task.ownerId === ownerId && task.status !== "COMPLETED") {
        await taskReference.update({
          data: { status: "FAILED", errorCode, updatedAt: this.db.serverDate() },
        });
      }
    });
  }

  async getVersions(versionIds, ownerId) {
    const versions = await Promise.all(
      versionIds.map((versionId) => readDocument(this.resumeVersions.doc(versionId))),
    );
    return versions.filter((version) => version && version.ownerId === ownerId);
  }

  async updateResumeDraft(ownerId, input) {
    return this.db.runTransaction(async (transaction) => {
      const reference = transaction.collection(COLLECTIONS.resumeVersions).doc(input.versionId);
      const version = await readDocument(reference);
      if (!version || version.ownerId !== ownerId) {
        throw new AppError("RESOURCE_FORBIDDEN", "无权修改该简历版本。");
      }
      if (getVersionStatus(version) === "CONFIRMED") {
        throw new AppError("RESUME_VERSION_CONFIRMED", "该版本已确认，不能继续修改。");
      }
      const currentRevision = getVersionRevision(version);
      if (currentRevision !== input.expectedRevision) {
        if (
          currentRevision === input.expectedRevision + 1 &&
          hasSameDraftContent(version, input)
        ) {
          return { ...version, revision: currentRevision, status: "DRAFT" };
        }
        throw new AppError("RESUME_VERSION_CONFLICT", "该版本已在其他位置更新，请刷新后重试。");
      }
      if (!Array.isArray(version.sections) || version.sections.length !== input.sectionTexts.length) {
        throw new AppError("RESUME_VERSION_INVALID", "简历段落结构已变化，请刷新后重试。");
      }

      const revision = currentRevision + 1;
      const sections = version.sections.map((section, index) => ({
        ...section,
        text: input.sectionTexts[index],
      }));
      const updated = {
        greetings: input.greetings,
        resumeTitle: input.resumeTitle,
        revision,
        sections,
        status: "DRAFT",
        updatedAt: this.db.serverDate(),
      };
      await reference.update({ data: updated });
      return { ...version, ...updated };
    });
  }

  async confirmResumeVersion(ownerId, input) {
    return this.db.runTransaction(async (transaction) => {
      const reference = transaction.collection(COLLECTIONS.resumeVersions).doc(input.versionId);
      const version = await readDocument(reference);
      if (!version || version.ownerId !== ownerId) {
        throw new AppError("RESOURCE_FORBIDDEN", "无权确认该简历版本。");
      }
      const currentRevision = getVersionRevision(version);
      if (getVersionStatus(version) === "CONFIRMED") {
        return { ...version, revision: currentRevision, status: "CONFIRMED" };
      }
      if (currentRevision !== input.expectedRevision) {
        throw new AppError("RESUME_VERSION_CONFLICT", "该版本已在其他位置更新，请刷新后重试。");
      }

      const updated = {
        confirmedAt: this.db.serverDate(),
        revision: currentRevision + 1,
        status: "CONFIRMED",
        updatedAt: this.db.serverDate(),
      };
      await reference.update({ data: updated });
      return { ...version, ...updated };
    });
  }
}

module.exports = { CareerRepository };
