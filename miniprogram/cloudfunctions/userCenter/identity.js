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

const toUsageDocumentId = (ownerId, date) => `${ownerId}_${date}`;

const getShanghaiDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

module.exports = {
  getShanghaiDate,
  toOwnerId,
  toUsageDocumentId,
};
