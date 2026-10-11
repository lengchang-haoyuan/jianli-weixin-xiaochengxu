const crypto = require("node:crypto");
const { AppError } = require("./errors");

const toOwnerId = (openid) => {
  if (typeof openid !== "string" || openid.length < 8) {
    throw new AppError("IDENTITY_UNAVAILABLE", "无法确认当前微信身份，请重新进入小程序。");
  }

  return crypto
    .createHash("sha256")
    .update(`resume-assistant:${openid}`, "utf8")
    .digest("hex")
    .slice(0, 32);
};

module.exports = {
  toOwnerId,
};

