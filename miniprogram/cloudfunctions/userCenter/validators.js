const { DELETE_CONFIRMATION, PRIVACY_VERSION } = require("./constants");
const { AppError } = require("./errors");

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizePayload = (payload) => (isPlainObject(payload) ? payload : {});

const assertMode = (mode) => {
  if (mode !== "student" && mode !== "social") {
    throw new AppError("INVALID_MODE", "请选择实习校招或社会招聘模式。");
  }

  return mode;
};

const validatePrivacyAcceptance = (payload) => {
  if (payload.accepted !== true) {
    throw new AppError("CONSENT_REQUIRED", "需要明确同意后才能继续使用。");
  }

  if (payload.privacyVersion !== PRIVACY_VERSION) {
    throw new AppError("PRIVACY_VERSION_MISMATCH", "隐私说明已更新，请刷新页面后重新确认。");
  }

  return {
    mode: assertMode(payload.mode),
    privacyVersion: payload.privacyVersion,
  };
};

const validateDeletion = (payload) => {
  if (payload.confirmation !== DELETE_CONFIRMATION) {
    throw new AppError("DELETE_CONFIRMATION_REQUIRED", "请完成删除确认后再试。");
  }
};

module.exports = {
  assertMode,
  normalizePayload,
  validateDeletion,
  validatePrivacyAcceptance,
};
