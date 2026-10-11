const CONTACT_LINE_PATTERN = /(姓名|姓\s*名|name\s*:|电话|手机|邮箱|邮件|微信|住址|地址|linkedin|github|phone|mobile|email|address|📍|☎|✉)/i;
const SECTION_LINE_PATTERN = /(教育|经历|技能|项目|证书|总结|求职|education|experience|skills|projects|certifications|summary)/i;

const redactInlineContacts = (text) =>
  text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[邮箱已移除]")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[链接已移除]")
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "[电话已移除]")
    .replace(/(?:\+?\d{1,3}[-\s]?)?(?:\(?\d{2,4}\)?[-\s]?)?\d{3,4}[-\s]\d{3,4}/g, "[电话已移除]")
    .replace(/\b\d{17}[0-9Xx]\b/g, "[证件号已移除]");

const prepareResumeForModel = (sourceText) => {
  const originalLines = sourceText.split(/\r?\n/).map((line) => line.trim());
  const contactLines = [];
  const sanitizedLines = [];
  let firstVisibleHandled = false;

  for (const line of originalLines) {
    if (!line) {
      if (sanitizedLines.at(-1) !== "") {
        sanitizedLines.push("");
      }
      continue;
    }

    if (CONTACT_LINE_PATTERN.test(line)) {
      contactLines.push(line);
      continue;
    }

    if (!firstVisibleHandled) {
      firstVisibleHandled = true;
      if (line.length <= 40 && !SECTION_LINE_PATTERN.test(line)) {
        contactLines.unshift(line);
        continue;
      }
    }

    sanitizedLines.push(redactInlineContacts(line));
  }

  return {
    contactBlock: contactLines.slice(0, 8).join("\n"),
    sanitizedText: sanitizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
};

const buildFactCatalog = (sanitizedText) => {
  const facts = sanitizedText
    .split(/\n+/)
    .map((text) => text.trim())
    .filter((text) => text.length >= 2)
    .slice(0, 240)
    .map((text, index) => ({ id: `fact-${String(index + 1).padStart(3, "0")}`, text }));

  if (facts.length === 0) {
    return [{ id: "fact-001", text: sanitizedText }];
  }
  return facts;
};

module.exports = { buildFactCatalog, prepareResumeForModel };
