const crypto = require("node:crypto");
const { PRIVACY_VERSION, UPLOAD_PREFIX } = require("./constants");
const { AppError } = require("./errors");
const {
  validateCreateUploadTarget,
  validateExtractResume,
  validateSaveConfirmedResume,
} = require("./validators");

const isSuccessfulDeleteResult = (result) => {
  const item = result && Array.isArray(result.fileList) ? result.fileList[0] : null;
  return Boolean(
    item && (item.code === "SUCCESS" || item.status === 0 || item.status === "0"),
  );
};

class ResumeService {
  constructor(repository, storage, extractText) {
    this.repository = repository;
    this.storage = storage;
    this.extractText = extractText;
  }

  async requireCurrentConsent(ownerId) {
    const user = await this.repository.getUser(ownerId);
    if (!user || user.consentVersion !== PRIVACY_VERSION) {
      throw new AppError("CONSENT_REQUIRED", "请先阅读并同意当前隐私说明。");
    }
    return user;
  }

  async createUploadTarget(ownerId, payload) {
    await this.requireCurrentConsent(ownerId);
    const { sourceType } = validateCreateUploadTarget(payload);
    return {
      cloudPath: `${UPLOAD_PREFIX}/${ownerId}/${crypto.randomUUID()}.${sourceType}`,
    };
  }

  async deleteTemporaryFile(fileID) {
    const result = await this.storage.deleteFile({ fileList: [fileID] });
    if (!isSuccessfulDeleteResult(result)) {
      throw new AppError(
        "TEMP_FILE_CLEANUP_FAILED",
        "临时文件清理未完成，已停止后续处理。请稍后重试。",
      );
    }
  }

  async extractResume(ownerId, payload) {
    await this.requireCurrentConsent(ownerId);
    const input = validateExtractResume(payload, ownerId);
    let extractedText = "";
    let operationError = null;
    let cleanupError = null;

    try {
      const download = await this.storage.downloadFile({ fileID: input.fileID });
      extractedText = await this.extractText(download && download.fileContent, input.sourceType);
    } catch (error) {
      operationError = error;
    }

    try {
      await this.deleteTemporaryFile(input.fileID);
    } catch (error) {
      cleanupError = error;
    }

    if (cleanupError) {
      throw cleanupError;
    }
    if (operationError) {
      if (operationError instanceof AppError) {
        throw operationError;
      }
      throw new AppError(
        "TEXT_EXTRACTION_FAILED",
        "无法提取该文件的文字。请修正文档，或将 PDF 转为 DOCX 后重试。",
      );
    }

    return {
      text: extractedText,
    };
  }

  async saveConfirmedResume(ownerId, payload) {
    await this.requireCurrentConsent(ownerId);
    const input = validateSaveConfirmedResume(payload);
    await this.repository.saveConfirmedResume(ownerId, input);
    return {
      saved: true,
    };
  }
}

module.exports = {
  ResumeService,
};
