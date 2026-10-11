const cloud = require("wx-server-sdk");
const { toPublicError, AppError } = require("./errors");
const { toOwnerId } = require("./identity");
const { UserRepository } = require("./repository");
const { UserService } = require("./user-service");
const { normalizePayload } = require("./validators");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const service = new UserService(new UserRepository(cloud.database()));

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const ownerId = toOwnerId(wxContext.OPENID);
    const action = event && typeof event.action === "string" ? event.action : "";
    const payload = normalizePayload(event && event.payload);

    let data;
    switch (action) {
      case "bootstrapSession":
        data = await service.bootstrapSession(ownerId);
        break;
      case "acceptPrivacy":
        data = await service.acceptPrivacy(ownerId, payload);
        break;
      case "setUserMode":
        data = await service.setUserMode(ownerId, payload);
        break;
      case "deleteAllUserData":
        data = await service.deleteAllUserData(ownerId, payload);
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
