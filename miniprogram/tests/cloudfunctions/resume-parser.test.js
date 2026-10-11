const assert = require("node:assert/strict");
const test = require("node:test");

const { MAX_FILE_BYTES, PRIVACY_VERSION } = require("../../cloudfunctions/resumeParser/constants");
const { AppError } = require("../../cloudfunctions/resumeParser/errors");
const {
  assertFileBuffer,
  createResumeTextExtractor,
  normalizeExtractedText,
} = require("../../cloudfunctions/resumeParser/extractor");
const { ResumeService } = require("../../cloudfunctions/resumeParser/resume-service");
const {
  validateExtractResume,
  validateSaveConfirmedResume,
} = require("../../cloudfunctions/resumeParser/validators");

const OWNER_ID = "a".repeat(32);
const OTHER_OWNER_ID = "b".repeat(32);
const FILE_NAME = "123e4567-e89b-42d3-a456-426614174000";
const getPath = (ownerId = OWNER_ID, sourceType = "pdf") =>
  `resume-input/${ownerId}/${FILE_NAME}.${sourceType}`;
const getFileID = (ownerId = OWNER_ID, sourceType = "pdf") =>
  `cloud://test.bucket/${getPath(ownerId, sourceType)}`;

const buildMinimalPdf = () => {
  const stream = "BT /F1 18 Tf 72 720 Td (Resume parser compatibility text) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content, "latin1"));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(content, "latin1");
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(content, "latin1");
};

class FakeRepository {
  constructor(user = { consentVersion: PRIVACY_VERSION }) {
    this.user = user;
    this.saved = null;
  }

  async getUser() {
    return this.user;
  }

  async saveConfirmedResume(ownerId, input) {
    this.saved = { ownerId, input };
  }
}

class FakeStorage {
  constructor({ fileContent = Buffer.from("%PDF-example"), deleteCode = "SUCCESS" } = {}) {
    this.fileContent = fileContent;
    this.deleteCode = deleteCode;
    this.deleted = [];
  }

  async downloadFile() {
    return { fileContent: this.fileContent };
  }

  async deleteFile({ fileList }) {
    this.deleted.push(...fileList);
    return {
      fileList: fileList.map((fileID) => ({ fileID, code: this.deleteCode })),
    };
  }
}

test("上传目标只生成当前用户目录下的 DOCX/PDF 路径", async () => {
  const service = new ResumeService(new FakeRepository(), new FakeStorage(), async () => "unused");
  const target = await service.createUploadTarget(OWNER_ID, { sourceType: "DOCX" });

  assert.match(
    target.cloudPath,
    new RegExp(`^resume-input/${OWNER_ID}/[0-9a-f-]{36}\\.docx$`),
  );
});

test("文件引用必须同时匹配当前用户、UUID 与扩展名", () => {
  assert.deepEqual(
    validateExtractResume({ fileID: getFileID(), sourceType: "pdf" }, OWNER_ID),
    { fileID: getFileID(), sourceType: "pdf" },
  );
  assert.throws(
    () =>
      validateExtractResume(
        { fileID: getFileID(OTHER_OWNER_ID), sourceType: "pdf" },
        OWNER_ID,
      ),
    (error) => error instanceof AppError && error.code === "FILE_OWNERSHIP_MISMATCH",
  );
  assert.throws(
    () =>
      validateExtractResume(
        { fileID: getFileID(OWNER_ID, "docx"), sourceType: "pdf" },
        OWNER_ID,
      ),
    (error) => error instanceof AppError && error.code === "FILE_OWNERSHIP_MISMATCH",
  );
});

test("文件大小与真实魔数在服务端再次校验", () => {
  assert.doesNotThrow(() => assertFileBuffer(Buffer.from("%PDF-example"), "pdf"));
  assert.doesNotThrow(() => assertFileBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "docx"));
  assert.throws(
    () => assertFileBuffer(Buffer.from("not-a-pdf"), "pdf"),
    (error) => error instanceof AppError && error.code === "FILE_CONTENT_MISMATCH",
  );
  assert.throws(
    () => assertFileBuffer(Buffer.alloc(MAX_FILE_BYTES + 1), "pdf"),
    (error) => error instanceof AppError && error.code === "FILE_TOO_LARGE",
  );
});

test("空白与过短提取结果不会进入人工确认", () => {
  assert.equal(
    normalizeExtractedText("第一段教育经历与课程信息\r\n\r\n\r\n第二段有足够的项目经历和技术栈事实文字内容"),
    "第一段教育经历与课程信息\n\n第二段有足够的项目经历和技术栈事实文字内容",
  );
  assert.throws(
    () => normalizeExtractedText("只有几个字"),
    (error) => error instanceof AppError && error.code === "NO_EXTRACTABLE_TEXT",
  );
});

test("DOCX 与 PDF 适配器只返回纯文字并关闭 PDF eval", async () => {
  let pdfOptions = null;
  let destroyed = false;
  const fakePdfDocument = {
    numPages: 2,
    async getPage(pageNumber) {
      return {
        async getTextContent() {
          return {
            items:
              pageNumber === 1
                ? [
                    { str: "PDF 简历项目经历", hasEOL: true },
                    { str: "包含 TypeScript", hasEOL: false },
                  ]
                : [{ str: "与微信云开发实践", hasEOL: false }],
          };
        },
      };
    },
  };
  const getDocument = (options) => {
    pdfOptions = options;
    return {
      promise: Promise.resolve(fakePdfDocument),
      async destroy() {
        destroyed = true;
      },
    };
  };

  const extractor = createResumeTextExtractor({
    loadMammoth: () => ({
      extractRawText: async () => ({ value: "DOCX 简历项目经历包含 TypeScript 与微信云开发实践" }),
    }),
    loadPdfJs: async () => ({ getDocument }),
  });

  assert.match(await extractor(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "docx"), /DOCX/);
  assert.match(await extractor(Buffer.from("%PDF-example"), "pdf"), /PDF/);
  assert.equal(pdfOptions.data instanceof Uint8Array, true);
  assert.equal(pdfOptions.isEvalSupported, false);
  assert.equal(pdfOptions.enableXfa, false);
  assert.equal(destroyed, true);
});

test("Node.js 18 兼容的真实 PDF.js 适配器可提取文字", async () => {
  const extractor = createResumeTextExtractor();
  const text = await extractor(buildMinimalPdf(), "pdf");

  assert.equal(text, "Resume parser compatibility text");
});

test("提取成功后先删除临时原文件再返回文字", async () => {
  const storage = new FakeStorage();
  const service = new ResumeService(
    new FakeRepository(),
    storage,
    async () => "教育经历与项目经历包含足够的真实简历文字内容",
  );

  const result = await service.extractResume(OWNER_ID, {
    fileID: getFileID(),
    sourceType: "pdf",
  });

  assert.deepEqual(result, {
    text: "教育经历与项目经历包含足够的真实简历文字内容",
  });
  assert.deepEqual(storage.deleted, [getFileID()]);
});

test("解析失败仍删除临时原文件", async () => {
  const storage = new FakeStorage();
  const service = new ResumeService(new FakeRepository(), storage, async () => {
    throw new AppError("NO_EXTRACTABLE_TEXT", "未提取到文字");
  });

  await assert.rejects(
    service.extractResume(OWNER_ID, { fileID: getFileID(), sourceType: "pdf" }),
    (error) => error instanceof AppError && error.code === "NO_EXTRACTABLE_TEXT",
  );
  assert.deepEqual(storage.deleted, [getFileID()]);
});

test("临时文件删除状态不成功时停止返回提取结果", async () => {
  const service = new ResumeService(
    new FakeRepository(),
    new FakeStorage({ deleteCode: "STORAGE_ERROR" }),
    async () => "教育经历与项目经历包含足够的真实简历文字内容",
  );

  await assert.rejects(
    service.extractResume(OWNER_ID, { fileID: getFileID(), sourceType: "pdf" }),
    (error) => error instanceof AppError && error.code === "TEMP_FILE_CLEANUP_FAILED",
  );
});

test("只有当前隐私版本且明确确认后才保存文字", async () => {
  const repository = new FakeRepository();
  const service = new ResumeService(repository, new FakeStorage(), async () => "unused");
  const text = "教育经历、课程与项目经历均已由用户逐字核对确认";

  await assert.rejects(
    service.saveConfirmedResume(OWNER_ID, { sourceType: "docx", text, confirmed: false }),
    (error) => error instanceof AppError && error.code === "CONFIRMATION_REQUIRED",
  );

  const result = await service.saveConfirmedResume(OWNER_ID, {
    sourceType: "docx",
    text,
    confirmed: true,
  });
  assert.equal(result.saved, true);
  assert.deepEqual(repository.saved, {
    ownerId: OWNER_ID,
    input: { sourceType: "docx", text },
  });

  const staleService = new ResumeService(
    new FakeRepository({ consentVersion: "old" }),
    new FakeStorage(),
    async () => "unused",
  );
  await assert.rejects(
    staleService.createUploadTarget(OWNER_ID, { sourceType: "pdf" }),
    (error) => error instanceof AppError && error.code === "CONSENT_REQUIRED",
  );
});

test("确认文字有 50000 字上限", () => {
  assert.throws(
    () =>
      validateSaveConfirmedResume({
        confirmed: true,
        sourceType: "pdf",
        text: "简".repeat(50001),
      }),
    (error) => error instanceof AppError && error.code === "RESUME_TEXT_TOO_LONG",
  );
});
