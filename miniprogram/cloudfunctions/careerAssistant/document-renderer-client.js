const {
  MAX_RENDERED_DOCX_BYTES,
  MAX_RENDERED_PDF_BYTES,
  MAX_RENDERED_PREVIEW_BYTES,
  MAX_RENDERED_PREVIEW_PAGES,
} = require("./constants");
const { AppError } = require("./errors");

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const decodeFile = (value, maxBytes, signature, message) => {
  if (
    typeof value !== "string" ||
    value.length < 4 ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value)
  ) {
    throw new AppError("RENDERER_INVALID_RESPONSE", message);
  }
  const file = Buffer.from(value, "base64");
  if (file.length < signature.length || file.length > maxBytes || !file.subarray(0, signature.length).equals(signature)) {
    throw new AppError("RENDERER_INVALID_RESPONSE", message);
  }
  return file;
};

const normalizeRenderedFiles = (data) => {
  if (!data || data.ok !== true || !data.data || typeof data.data !== "object") {
    const code = data && data.error && typeof data.error.code === "string"
      ? data.error.code
      : "DOCUMENT_RENDER_FAILED";
    const message = data && data.error && typeof data.error.message === "string"
      ? data.error.message
      : "文档渲染暂时不可用，请稍后重试。";
    throw new AppError(code, message);
  }

  const output = data.data;
  const pageCount = output.pageCount;
  const previews = output.previewBase64;
  if (
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > MAX_RENDERED_PREVIEW_PAGES ||
    !Array.isArray(previews) ||
    previews.length !== pageCount
  ) {
    throw new AppError("RENDERER_INVALID_RESPONSE", "文档预览页数异常，本次未保存。");
  }

  return {
    docx: decodeFile(
      output.docxBase64,
      MAX_RENDERED_DOCX_BYTES,
      Buffer.from("PK"),
      "DOCX 文件生成异常，本次未保存。",
    ),
    pageCount,
    pdf: decodeFile(
      output.pdfBase64,
      MAX_RENDERED_PDF_BYTES,
      Buffer.from("%PDF"),
      "PDF 文件生成异常，本次未保存。",
    ),
    previews: previews.map((preview) =>
      decodeFile(
        preview,
        MAX_RENDERED_PREVIEW_BYTES,
        Buffer.from([0xff, 0xd8, 0xff]),
        "文档预览生成异常，本次未保存。",
      )),
  };
};

class DocumentRendererClient {
  constructor(options = {}) {
    this.serviceName = options.serviceName || process.env.DOCUMENT_RENDERER_SERVICE || "resume-renderer";
    if (options.cloudbaseApp) {
      this.cloudbaseApp = options.cloudbaseApp;
    } else {
      const cloudbase = require("@cloudbase/node-sdk");
      this.cloudbaseApp = cloudbase.init({
        env: cloudbase.SYMBOL_CURRENT_ENV,
        timeout: 45_000,
      });
    }
  }

  async render(version, templateId) {
    let response;
    try {
      response = await this.cloudbaseApp.callContainer({
        data: {
          contactBlock: version.contactBlock || "",
          language: version.language,
          resumeTitle: version.resumeTitle,
          sections: version.sections.map((section) => ({
            text: section.text,
            title: section.section,
          })),
          templateId,
        },
        method: "POST",
        name: this.serviceName,
        path: "/render",
      });
    } catch (_error) {
      throw new AppError("DOCUMENT_RENDER_UNAVAILABLE", "文档渲染服务暂时不可用，请稍后重试。");
    }
    if (response && response.data && response.data.ok === false) {
      return normalizeRenderedFiles(response.data);
    }
    if (!response || response.statusCode !== 200) {
      throw new AppError("DOCUMENT_RENDER_FAILED", "文档生成未完成，请稍后重试。");
    }
    return normalizeRenderedFiles(response.data);
  }
}

module.exports = { DocumentRendererClient, normalizeRenderedFiles };
