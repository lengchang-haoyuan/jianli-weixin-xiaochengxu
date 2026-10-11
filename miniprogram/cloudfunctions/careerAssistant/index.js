const cloud = require("wx-server-sdk");
const { CareerService } = require("./career-service");
const { DocumentRendererClient } = require("./document-renderer-client");
const { toPublicError, AppError } = require("./errors");
const { ExportFileStore } = require("./export-file-store");
const { toOwnerId } = require("./identity");
const { DeepSeekProvider } = require("./model-provider");
const { CareerRepository } = require("./repository");
const { normalizePayload } = require("./validators");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const service = new CareerService(
  new CareerRepository(cloud.database()),
  new DeepSeekProvider(),
  new DocumentRendererClient(),
  new ExportFileStore(cloud),
);

exports.main = async (event) => {
  try {
    const ownerId = toOwnerId(cloud.getWXContext().OPENID);
    const action = event && typeof event.action === "string" ? event.action : "";
    const payload = normalizePayload(event && event.payload);
    let data;

    switch (action) {
      case "savePreferences":
        data = await service.savePreferences(ownerId, payload);
        break;
      case "saveQuestionnaire":
        data = await service.saveQuestionnaire(ownerId, payload);
        break;
      case "analyzeRoleMatches":
        data = await service.analyzeRoleMatches(ownerId);
        break;
      case "getRoleAnalysis":
        data = await service.getRoleAnalysis(ownerId, payload);
        break;
      case "generateResumePackage":
        data = await service.generateResumePackage(ownerId, payload);
        break;
      case "getGenerationTask":
        data = await service.getGenerationTask(ownerId, payload);
        break;
      case "updateResumeDraft":
        data = await service.updateResumeDraft(ownerId, payload);
        break;
      case "confirmResumeVersion":
        data = await service.confirmResumeVersion(ownerId, payload);
        break;
      case "renderResumeFiles":
        data = await service.renderResumeFiles(ownerId, payload);
        break;
      default:
        throw new AppError("INVALID_ACTION", "无法识别当前操作，请刷新后重试。");
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toPublicError(error) };
  }
};
