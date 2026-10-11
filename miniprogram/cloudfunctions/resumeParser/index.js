const cloud = require("wx-server-sdk");
const { toPublicError, AppError } = require("./errors");
const { createResumeTextExtractor } = require("./extractor");
const { toOwnerId } = require("./identity");
const { ResumeRepository } = require("./repository");
const { ResumeService } = require("./resume-service");
const { normalizePayload } = require("./validators");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const service = new ResumeService(
  new ResumeRepository(cloud.database()),
  {
    deleteFile: (options) => cloud.deleteFile(options),
    downloadFile: (options) => cloud.downloadFile(options),
  },
  createResumeTextExtractor(),
);

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const ownerId = toOwnerId(wxContext.OPENID);
    const action = event && typeof event.action === "string" ? event.action : "";
    const payload = normalizePayload(event && event.payload);

    let data;
    switch (action) {
      case "createUploadTarget":
        data = await service.createUploadTarget(ownerId, payload);
        break;
      case "extractResume":
        data = await service.extractResume(ownerId, payload);
        break;
      case "saveConfirmedResume":
        data = await service.saveConfirmedResume(ownerId, payload);
        break;
      default:
        throw new AppError("INVALID_ACTION", "无法识别当前操作，请刷新后重试。");
    }

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: toPublicError(error),
    };
  }
};

