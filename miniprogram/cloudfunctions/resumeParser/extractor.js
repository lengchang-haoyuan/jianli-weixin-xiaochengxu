const { MAX_FILE_BYTES, MAX_TEXT_CHARACTERS, MIN_VISIBLE_CHARACTERS } = require("./constants");
const { AppError } = require("./errors");

const assertFileBuffer = (fileContent, sourceType) => {
  if (!Buffer.isBuffer(fileContent) || fileContent.length === 0) {
    throw new AppError("EMPTY_FILE", "文件内容为空，请重新选择。");
  }
  if (fileContent.length > MAX_FILE_BYTES) {
    throw new AppError("FILE_TOO_LARGE", "文件不能超过 10MB。");
  }

  const isPdf = fileContent.subarray(0, 5).toString("ascii") === "%PDF-";
  const isZip =
    fileContent[0] === 0x50 &&
    fileContent[1] === 0x4b &&
    ((fileContent[2] === 0x03 && fileContent[3] === 0x04) ||
      (fileContent[2] === 0x05 && fileContent[3] === 0x06) ||
      (fileContent[2] === 0x07 && fileContent[3] === 0x08));

  if ((sourceType === "pdf" && !isPdf) || (sourceType === "docx" && !isZip)) {
    throw new AppError("FILE_CONTENT_MISMATCH", "文件内容与扩展名不一致，请重新导出后上传。");
  }
};

const normalizeExtractedText = (value) => {
  const text = String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const visibleLength = text.replace(/\s/g, "").length;

  if (visibleLength < MIN_VISIBLE_CHARACTERS) {
    throw new AppError(
      "NO_EXTRACTABLE_TEXT",
      "未提取到足够文字。请确认 PDF 含可选中文字，或改为上传 DOCX。",
    );
  }
  if (text.length > MAX_TEXT_CHARACTERS) {
    throw new AppError("EXTRACTED_TEXT_TOO_LONG", "提取文字超过 50000 字，请精简文档后重试。");
  }

  return text;
};

const readPdfText = async (fileContent, loadPdfJs) => {
  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({
    data: new Uint8Array(fileContent),
    disableFontFace: true,
    enableXfa: false,
    isEvalSupported: false,
    maxImageSize: 1,
    useSystemFonts: false,
  });

  try {
    const document = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          if (!item || typeof item.str !== "string") {
            return "";
          }
          return item.hasEOL ? `${item.str}\n` : item.str;
        })
        .join("")
        .trim();
      pages.push(pageText);
    }
    return pages.join("\n\n");
  } finally {
    await loadingTask.destroy();
  }
};

const createResumeTextExtractor = ({ loadMammoth, loadPdfJs } = {}) => {
  const getMammoth = loadMammoth || (() => require("mammoth"));
  const getPdfJs = loadPdfJs || (() => import("pdfjs-dist/legacy/build/pdf.mjs"));

  return async (fileContent, sourceType) => {
    assertFileBuffer(fileContent, sourceType);

    try {
      if (sourceType === "docx") {
        const mammoth = getMammoth();
        const result = await mammoth.extractRawText({ buffer: fileContent });
        return normalizeExtractedText(result.value);
      }

      return normalizeExtractedText(await readPdfText(fileContent, getPdfJs));
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        "TEXT_EXTRACTION_FAILED",
        "无法提取该文件的文字。请修正文档，或将 PDF 转为 DOCX 后重试。",
      );
    }
  };
};

module.exports = {
  assertFileBuffer,
  createResumeTextExtractor,
  normalizeExtractedText,
};
