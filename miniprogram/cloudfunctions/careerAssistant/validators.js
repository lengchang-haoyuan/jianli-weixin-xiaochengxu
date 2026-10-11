const {
  MAX_GENERATION_DIRECTIONS,
  MAX_INTENT_CHARACTERS,
  MAX_QUESTION_COUNT,
  MAX_RESUME_GREETING_CHARACTERS,
  MAX_RESUME_GREETINGS,
  MAX_RESUME_SECTION_CHARACTERS,
  MAX_RESUME_SECTIONS,
  MAX_RESUME_TITLE_CHARACTERS,
  RESUME_TEMPLATES,
} = require("./constants");
const { AppError } = require("./errors");

const LANGUAGES = Object.freeze(["zh-CN", "en", "bilingual"]);
const ANSWERS = Object.freeze(["yes", "no", "unknown"]);

const normalizePayload = (payload) =>
  payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};

const assertLanguage = (value) => {
  if (!LANGUAGES.includes(value)) {
    throw new AppError("INVALID_LANGUAGE", "请选择中文、英文或双语输出。");
  }
  return value;
};

const validatePreferences = (payload) => {
  const rawIntent = typeof payload.rawIntent === "string" ? payload.rawIntent.trim() : "";
  if (rawIntent.length > MAX_INTENT_CHARACTERS) {
    throw new AppError("ROLE_INTENT_TOO_LONG", "意向方向不能超过 60 个字符。");
  }
  return { language: assertLanguage(payload.language), rawIntent };
};

const validateQuestionnaire = (payload, questionIds) => {
  if (payload.skipped === true) {
    return { answers: {}, skipped: true };
  }

  const answers = payload.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new AppError("QUESTIONNAIRE_INCOMPLETE", "请完成 12 道题，或选择跳过问卷。");
  }

  const normalized = {};
  for (const questionId of questionIds) {
    const answer = answers[questionId];
    if (!ANSWERS.includes(answer)) {
      throw new AppError("QUESTIONNAIRE_INCOMPLETE", "请完成 12 道题，或选择跳过问卷。");
    }
    normalized[questionId] = answer;
  }
  if (Object.keys(normalized).length !== MAX_QUESTION_COUNT) {
    throw new AppError("QUESTIONNAIRE_INVALID", "问卷版本不匹配，请刷新后重试。");
  }
  return { answers: normalized, skipped: false };
};

const validateAnalysisId = (value) => {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/.test(value)) {
    throw new AppError("INVALID_ANALYSIS", "无法识别岗位分析结果，请重新分析。");
  }
  return value;
};

const validateGenerationRequest = (payload) => {
  const analysisId = validateAnalysisId(payload.analysisId);
  const selectedDirectionIds = Array.isArray(payload.selectedDirectionIds)
    ? [...new Set(payload.selectedDirectionIds)]
    : [];
  if (
    selectedDirectionIds.length < 1 ||
    selectedDirectionIds.length > MAX_GENERATION_DIRECTIONS ||
    selectedDirectionIds.some((id) => typeof id !== "string" || !/^[a-z0-9-]{2,64}$/.test(id))
  ) {
    throw new AppError("INVALID_DIRECTION_SELECTION", "请选择 1 至 3 个岗位方向。");
  }
  if (typeof payload.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{16,96}$/.test(payload.idempotencyKey)) {
    throw new AppError("INVALID_REQUEST_KEY", "生成请求已失效，请返回后重试。");
  }
  return { analysisId, idempotencyKey: payload.idempotencyKey, selectedDirectionIds };
};

const validateTaskId = (value) => {
  if (typeof value !== "string" || !/^task_[0-9a-f]{40}$/.test(value)) {
    throw new AppError("INVALID_TASK", "无法识别生成任务，请重新开始。");
  }
  return value;
};

const validateVersionId = (value) => {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/.test(value)) {
    throw new AppError("INVALID_RESUME_VERSION", "无法识别当前简历版本，请刷新后重试。");
  }
  return value;
};

const validateExpectedRevision = (value) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError("INVALID_RESUME_REVISION", "简历版本状态已失效，请刷新后重试。");
  }
  return value;
};

const normalizeRequiredText = (value, maxLength, errorCode, message) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) {
    throw new AppError(errorCode, message);
  }
  return text;
};

const validateResumeDraft = (payload) => {
  const sectionTexts = Array.isArray(payload.sectionTexts)
    ? payload.sectionTexts.map((text) =>
      normalizeRequiredText(
        text,
        MAX_RESUME_SECTION_CHARACTERS,
        "INVALID_RESUME_SECTION",
        `每个简历段落需为 1 至 ${MAX_RESUME_SECTION_CHARACTERS} 个字符。`,
      ))
    : [];
  if (sectionTexts.length < 1 || sectionTexts.length > MAX_RESUME_SECTIONS) {
    throw new AppError("INVALID_RESUME_SECTIONS", "简历段落数量不符合要求，请刷新后重试。");
  }

  const greetings = Array.isArray(payload.greetings)
    ? payload.greetings.map((text) =>
      normalizeRequiredText(
        text,
        MAX_RESUME_GREETING_CHARACTERS,
        "INVALID_RESUME_GREETING",
        `每条打招呼语需为 1 至 ${MAX_RESUME_GREETING_CHARACTERS} 个字符。`,
      ))
    : [];
  if (greetings.length < 1 || greetings.length > MAX_RESUME_GREETINGS) {
    throw new AppError("INVALID_RESUME_GREETINGS", "请保留 1 至 3 条打招呼语。");
  }

  return {
    expectedRevision: validateExpectedRevision(payload.expectedRevision),
    greetings,
    resumeTitle: normalizeRequiredText(
      payload.resumeTitle,
      MAX_RESUME_TITLE_CHARACTERS,
      "INVALID_RESUME_TITLE",
      `简历标题需为 1 至 ${MAX_RESUME_TITLE_CHARACTERS} 个字符。`,
    ),
    sectionTexts,
    versionId: validateVersionId(payload.versionId),
  };
};

const validateConfirmResumeVersion = (payload) => ({
  expectedRevision: validateExpectedRevision(payload.expectedRevision),
  versionId: validateVersionId(payload.versionId),
});

const validateRenderResumeFiles = (payload) => {
  const templateId = typeof payload.templateId === "string" ? payload.templateId : "";
  if (!Object.hasOwn(RESUME_TEMPLATES, templateId)) {
    throw new AppError("INVALID_RESUME_TEMPLATE", "请选择有效的简历模板。");
  }
  return {
    templateId,
    versionId: validateVersionId(payload.versionId),
  };
};

module.exports = {
  normalizePayload,
  validateAnalysisId,
  validateConfirmResumeVersion,
  validateGenerationRequest,
  validatePreferences,
  validateQuestionnaire,
  validateRenderResumeFiles,
  validateResumeDraft,
  validateTaskId,
  validateVersionId,
};
