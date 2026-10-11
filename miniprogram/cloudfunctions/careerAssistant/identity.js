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

const getShanghaiDate = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const toUsageDocumentId = (ownerId, date) => `${ownerId}_${date}`;

module.exports = { getShanghaiDate, toOwnerId, toUsageDocumentId };
