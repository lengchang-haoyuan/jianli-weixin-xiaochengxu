const { MAX_TEXT_CHARACTERS, MIN_VISIBLE_CHARACTERS, UPLOAD_PREFIX } = require("./constants");
const { AppError } = require("./errors");

const SOURCE_TYPES = Object.freeze(["docx", "pdf"]);

const normalizePayload = (payload) =>
  payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};

const assertSourceType = (value) => {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (!SOURCE_TYPES.includes(normalized)) {
    throw new AppError("UNSUPPORTED_FILE_TYPE", "仅支持 DOCX 或 PDF 文件。");
  }
  return normalized;
};

const validateCreateUploadTarget = (payload) => ({
  sourceType: assertSourceType(payload.sourceType),
});

const getCloudPath = (fileID) => {
  if (typeof fileID !== "string" || fileID.length > 1024 || !fileID.startsWith("cloud://")) {
    throw new AppError("INVALID_FILE_REFERENCE", "无法识别所选文件，请重新选择。");
  }

  const pathStart = fileID.indexOf("/", "cloud://".length);
  if (pathStart < 0 || pathStart === fileID.length - 1) {
    throw new AppError("INVALID_FILE_REFERENCE", "无法识别所选文件，请重新选择。");
  }

  return fileID.slice(pathStart + 1);
};

const validateOwnedFile = (fileID, ownerId, sourceType) => {
  const cloudPath = getCloudPath(fileID);
  const escapedPrefix = UPLOAD_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expectedPath = new RegExp(
    `^${escapedPrefix}/${ownerId}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${sourceType}$`,
  );

  if (!expectedPath.test(cloudPath)) {
    throw new AppError("FILE_OWNERSHIP_MISMATCH", "文件不属于当前处理任务，请重新选择。");
  }
};

const validateExtractResume = (payload, ownerId) => {
  const sourceType = assertSourceType(payload.sourceType);
  const fileID = payload.fileID;
  validateOwnedFile(fileID, ownerId, sourceType);
  return { fileID, sourceType };
};

const normalizeConfirmedText = (value) => {
  if (typeof value !== "string") {
    throw new AppError("INVALID_RESUME_TEXT", "请先核对提取出的简历文字。");
  }

  const text = value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
  const visibleLength = text.replace(/\s/g, "").length;
  if (visibleLength < MIN_VISIBLE_CHARACTERS) {
    throw new AppError("RESUME_TEXT_TOO_SHORT", "简历文字过少，请补充后再确认。");
  }
  if (text.length > MAX_TEXT_CHARACTERS) {
    throw new AppError("RESUME_TEXT_TOO_LONG", "简历文字超过 50000 字，请精简后再确认。");
  }

  return text;
};

const validateSaveConfirmedResume = (payload) => {
  if (payload.confirmed !== true) {
    throw new AppError("CONFIRMATION_REQUIRED", "请确认这些文字与原简历事实一致。");
  }

  return {
    sourceType: assertSourceType(payload.sourceType),
    text: normalizeConfirmedText(payload.text),
  };
};

module.exports = {
  normalizePayload,
  validateCreateUploadTarget,
  validateExtractResume,
  validateSaveConfirmedResume,
};
