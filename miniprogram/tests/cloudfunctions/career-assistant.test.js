const assert = require("node:assert/strict");
const test = require("node:test");

const { CareerService } = require("../../cloudfunctions/careerAssistant/career-service");
const {
  ANALYSIS_MODEL_TIMEOUT_MS,
  COLLECTIONS,
  GENERATION_MODEL_TIMEOUT_MS,
} = require("../../cloudfunctions/careerAssistant/constants");
const { AppError } = require("../../cloudfunctions/careerAssistant/errors");
const { normalizeRenderedFiles } = require("../../cloudfunctions/careerAssistant/document-renderer-client");
const { ExportFileStore } = require("../../cloudfunctions/careerAssistant/export-file-store");
const { validateGeneratedPackages } = require("../../cloudfunctions/careerAssistant/generation-validator");
const { DeepSeekProvider } = require("../../cloudfunctions/careerAssistant/model-provider");
const { prepareResumeForModel } = require("../../cloudfunctions/careerAssistant/privacy");
const {
  QUESTION_IDS,
  calculateQuestionnaireScores,
} = require("../../cloudfunctions/careerAssistant/questionnaire");
const { scoreRoleMappings } = require("../../cloudfunctions/careerAssistant/role-scoring");
const { CareerRepository } = require("../../cloudfunctions/careerAssistant/repository");
const {
  validateConfirmResumeVersion,
  validateRenderResumeFiles,
  validateResumeDraft,
} = require("../../cloudfunctions/careerAssistant/validators");

const OWNER_ID = "a".repeat(32);
const QUESTION_ANSWERS = Object.fromEntries(QUESTION_IDS.map((id) => [id, "yes"]));
const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const clonePlainValue = (value) => JSON.parse(JSON.stringify(value));

const buildMapping = (directionId, quote, score) => ({
  directionId,
  categoryScores: {
    technology_projects: score,
    internship_work: score,
    major_courses: score,
    competition_certificates: score,
    education_school: score,
  },
  evidence: [{ category: "technology_projects", criterion: "项目证据", quote }],
  gaps: ["可继续补充可验证项目结果"],
});

test("问卷正反向题按固定版本计分", () => {
  const scores = calculateQuestionnaireScores(QUESTION_ANSWERS, false);
  assert.equal(scores.communication_collaboration, 100);
  assert.equal(scores.quality_discipline, 50);
  assert.deepEqual(calculateQuestionnaireScores({}, true), {});
});

test("发送模型前移除姓名、邮箱、电话和地址行", () => {
  const prepared = prepareResumeForModel(
    "张三\n📍 北京市海淀区\n邮箱 zhangsan@example.com\n电话 13800138000\n项目经历\n使用 Vue 与 TypeScript 完成管理系统",
  );
  assert.doesNotMatch(prepared.sanitizedText, /张三|海淀|example\.com|13800138000/);
  assert.match(prepared.sanitizedText, /Vue 与 TypeScript/);
  assert.match(prepared.contactBlock, /张三/);
});

test("岗位分数由程序计算且只保留逐字存在的证据", () => {
  const text = "使用 Vue 与 TypeScript 完成管理系统";
  const result = scoreRoleMappings(
    {
      mappings: [
        buildMapping("vue-frontend", text, 90),
        buildMapping("web-frontend", "不存在的证据", 80),
        buildMapping("nodejs-fullstack", text, 70),
      ],
    },
    "student",
    {},
    text,
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].directionId, "vue-frontend");
  assert.equal(result.find((item) => item.directionId === "web-frontend").evidence.length, 0);
  assert.equal(result.find((item) => item.directionId === "web-frontend").score, 0);
});

test("生成内容拒绝不存在的事实编号与新增数字", () => {
  const matches = [{ directionId: "vue-frontend", name: "Vue.js前端" }];
  const facts = [{ id: "fact-001", text: "完成 Vue 项目并提升性能 20%" }];
  const basePackage = {
    directionId: "vue-frontend",
    resumeTitle: "前端开发简历",
    greetings: ["您好，我有相关项目经验，希望进一步沟通。"],
    sections: [
      { section: "项目", text: "完成 Vue 项目并提升性能 20%", factIds: ["fact-001"], changeType: "rewrite", language: "zh-CN" },
      { section: "技能", text: "Vue 项目实践", factIds: ["fact-001"], changeType: "reorder", language: "zh-CN" },
    ],
  };
  assert.equal(
    validateGeneratedPackages({ packages: [basePackage] }, matches, facts, "zh-CN").length,
    1,
  );
  assert.throws(
    () =>
      validateGeneratedPackages(
        { packages: [{ ...basePackage, sections: [{ ...basePackage.sections[0], text: "提升性能 80%" }, basePackage.sections[1]] }] },
        matches,
        facts,
        "zh-CN",
      ),
    (error) => error instanceof AppError && error.code === "MODEL_OUTPUT_INVALID",
  );
});

class FakeRepository {
  constructor() {
    this.user = {
      consentVersion: "2026-09-15",
      mode: "student",
      confirmedResume: { text: "项目经历\n使用 Vue 与 TypeScript 完成管理系统" },
    };
    this.preferences = { language: "zh-CN", rawIntent: "前端" };
    this.questionnaire = { questionnaireVersion: "2026-09-14", scores: {}, skipped: true };
    this.analysis = null;
  }
  async getUser() { return this.user; }
  async getPreferences() { return this.preferences; }
  async getQuestionnaire() { return this.questionnaire; }
  async saveAnalysis(_ownerId, analysis) { this.analysis = { ownerId: OWNER_ID, ...analysis }; }
}

test("岗位分析只返回服务端计算后的三个方向", async () => {
  const repository = new FakeRepository();
  const provider = {
    async analyzeRoles() {
      return {
        data: {
          mappings: [
            buildMapping("vue-frontend", "使用 Vue 与 TypeScript 完成管理系统", 90),
            buildMapping("web-frontend", "使用 Vue 与 TypeScript 完成管理系统", 80),
            buildMapping("nodejs-fullstack", "使用 Vue 与 TypeScript 完成管理系统", 70),
          ],
        },
        usage: { total_tokens: 100 },
      };
    },
  };
  const result = await new CareerService(repository, provider).analyzeRoleMatches(OWNER_ID);
  assert.equal(result.matches.length, 3);
  assert.equal(Object.hasOwn(result, "tokenUsage"), false);
  assert.equal(repository.analysis.ownerId, OWNER_ID);
});

test("DeepSeek Responses 请求只发送结构化输出并使用服务端密钥", async () => {
  let request = null;
  const provider = new DeepSeekProvider({
    apiKey: "test-secret",
    model: "deepseek-flash",
    async fetchImpl(url, options) {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return {
            status: "completed",
            output: [{
              type: "message",
              content: [{
                type: "output_text",
                text: JSON.stringify({
                  mappings: [
                    buildMapping("vue-frontend", "Vue", 80),
                    buildMapping("web-frontend", "Vue", 70),
                    buildMapping("nodejs-fullstack", "Vue", 60),
                  ],
                }),
              }],
            }],
            usage: { total_tokens: 42 },
          };
        },
      };
    },
  });

  const response = await provider.analyzeRoles({ resumeText: "Vue" });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://api.deepseek.com/responses");
  assert.equal(request.options.headers.Authorization, "Bearer test-secret");
  assert.equal(body.model, "deepseek-flash");
  assert.equal(body.reasoning.effort, "none");
  assert.equal(body.temperature, 0.2);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.name, "role_match_analysis");
  const mappingSchema = body.text.format.schema.properties.mappings;
  assert.equal(mappingSchema.minItems, 3);
  assert.equal(mappingSchema.maxItems, 3);
  assert.equal(mappingSchema.items.properties.evidence.items.properties.criterion.maxLength, 80);
  assert.equal(mappingSchema.items.properties.evidence.items.properties.quote.maxLength, 240);
  assert.equal(mappingSchema.items.properties.gaps.items.maxLength, 120);
  assert.match(body.instructions, /比较standard中的全部岗位方向/);
  assert.equal(response.usage.total_tokens, 42);
});

test("简历生成关闭思考模式以适配云函数执行时限", async () => {
  let request = null;
  const provider = new DeepSeekProvider({
    apiKey: "test-secret",
    model: "deepseek-flash",
    async fetchImpl(url, options) {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return {
            status: "completed",
            output: [{
              type: "message",
              content: [{
                type: "output_text",
                text: `\`\`\`json\n${JSON.stringify({ packages: [] })}\n\`\`\``,
              }],
            }],
          };
        },
      };
    },
  });

  await provider.generateResumePackages({
    directions: [{ directionId: "java-backend" }],
    facts: [{ id: "fact-001", text: "Java 项目" }],
    language: "zh-CN",
  });
  const body = JSON.parse(request.options.body);
  assert.equal(body.reasoning.effort, "none");
  assert.equal(body.temperature, 0.2);
  assert.match(body.instructions, /数字、日期、百分比和金额必须逐字复用/);
  assert.deepEqual(body.text.format.schema.properties.packages.items.properties.directionId.enum, [
    "java-backend",
  ]);
  const sectionProperties =
    body.text.format.schema.properties.packages.items.properties.sections.items.properties;
  assert.deepEqual(sectionProperties.factIds.items.enum, ["fact-001"]);
  assert.deepEqual(sectionProperties.language.enum, ["zh-CN"]);
});

test("模型返回拆分的正文片段时组合完整 JSON，忽略推理片段", async () => {
  const provider = new DeepSeekProvider({
    apiKey: "test-secret",
    model: "deepseek-flash",
    async fetchImpl() {
      return {
        ok: true,
        async json() {
          return {
            status: "completed",
            output: [
              { type: "reasoning", content: [{ type: "reasoning_text", text: "不属于结果" }] },
              { type: "message", content: [
                { type: "output_text", text: '{"packages":[' },
                { type: "output_text", text: "]}" },
              ] },
            ],
          };
        },
      };
    },
  });

  const result = await provider.generateResumePackages({ facts: [] });
  assert.deepEqual(result.data, { packages: [] });
});

test("模型在完整 JSON 前后附加说明文字时提取唯一对象", async () => {
  const provider = new DeepSeekProvider({
    apiKey: "test-secret",
    model: "deepseek-flash",
    async fetchImpl() {
      return {
        ok: true,
        async json() {
          return {
            status: "completed",
            output: [{
              type: "message",
              content: [{
                type: "output_text",
                text: '以下是结果：\n{"packages":[]}\n请查收。',
              }],
            }],
          };
        },
      };
    },
  });

  const result = await provider.generateResumePackages({ facts: [] });
  assert.deepEqual(result.data, { packages: [] });
});

test("模型返回多个完整 JSON 对象时拒绝猜测目标对象", async () => {
  const provider = new DeepSeekProvider({
    apiKey: "test-secret",
    model: "deepseek-flash",
    async fetchImpl() {
      return {
        ok: true,
        async json() {
          return {
            status: "completed",
            output: [{
              type: "message",
              content: [{
                type: "output_text",
                text: '示例：{"packages":[]}；正式：{"packages":[]}',
              }],
            }],
          };
        },
      };
    },
  });

  await assert.rejects(
    () => provider.generateResumePackages({ facts: [] }),
    (error) => error instanceof AppError && error.code === "MODEL_OUTPUT_INVALID",
  );
});

test("模型结构化结果无法解析时保留明确错误语义", async () => {
  const provider = new DeepSeekProvider({
    apiKey: "test-secret",
    model: "deepseek-flash",
    async fetchImpl() {
      return {
        ok: true,
        async json() {
          return {
            status: "completed",
            output: [{
              type: "message",
              content: [{ type: "output_text", text: "{invalid-json" }],
            }],
          };
        },
      };
    },
  });

  await assert.rejects(
    () => provider.generateResumePackages({ facts: [] }),
    (error) =>
      error instanceof AppError &&
      error.code === "MODEL_OUTPUT_INVALID" &&
      error.message === "AI 返回格式无法解析，本次未保存。",
  );
});

test("模型请求使用单次预算且超时后不重复调用", async () => {
  let analysisAttempts = 0;
  const analysisProvider = new DeepSeekProvider({
    apiKey: "test-secret",
    model: "deepseek-flash",
    async fetchImpl() {
      analysisAttempts += 1;
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  await assert.rejects(
    () => analysisProvider.analyzeRoles({ resumeText: "Vue" }),
    (error) => error instanceof AppError && error.code === "MODEL_TIMEOUT",
  );

  let generationAttempts = 0;
  const generationProvider = new DeepSeekProvider({
    apiKey: "test-secret",
    model: "deepseek-flash",
    async fetchImpl() {
      generationAttempts += 1;
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  await assert.rejects(
    () => generationProvider.generateResumePackages({ facts: [] }),
    (error) => error instanceof AppError && error.code === "MODEL_TIMEOUT",
  );

  assert.equal(analysisAttempts, 1);
  assert.equal(generationAttempts, 1);
  assert.ok(GENERATION_MODEL_TIMEOUT_MS > ANALYSIS_MODEL_TIMEOUT_MS);
  assert.ok(ANALYSIS_MODEL_TIMEOUT_MS < 60000);
  assert.ok(GENERATION_MODEL_TIMEOUT_MS < 60000);
});

class InMemoryDatabase {
  constructor() {
    this.data = new Map();
  }

  serverDate() {
    return "SERVER_DATE";
  }

  collection(name) {
    if (!this.data.has(name)) {
      this.data.set(name, new Map());
    }
    const collection = this.data.get(name);
    return {
      doc(id) {
        return {
          async get() {
            return { data: collection.get(id) || null };
          },
          async set({ data }) {
            collection.set(id, clonePlainValue(data));
          },
          async update({ data }) {
            collection.set(id, { ...(collection.get(id) || {}), ...clonePlainValue(data) });
          },
        };
      },
    };
  }

  runTransaction(handler) {
    return handler(this);
  }

  get(name, id) {
    return this.data.get(name)?.get(id) || null;
  }
}

test("生成额度成功时只扣一次且重复预留保持幂等", async () => {
  const database = new InMemoryDatabase();
  const repository = new CareerRepository(database);
  const date = "2026-09-16";
  const taskId = `task_${"b".repeat(40)}`;
  const task = { analysisId: "analysis-1", selectedDirectionIds: ["vue-frontend"], taskId };

  assert.equal(await repository.reserveGeneration(OWNER_ID, date, task), true);
  assert.equal(await repository.reserveGeneration(OWNER_ID, date, task), false);
  const usageId = `${OWNER_ID}_${date}`;
  assert.equal(database.get(COLLECTIONS.dailyUsage, usageId).reservedCount, 1);
  assert.equal(database.get(COLLECTIONS.dailyUsage, usageId).usedCount, 0);

  await repository.completeGeneration(
    OWNER_ID,
    date,
    taskId,
    [{ versionId: "version-1", directionId: "vue-frontend" }],
    { total_tokens: 88 },
  );
  await repository.completeGeneration(
    OWNER_ID,
    date,
    taskId,
    [{ versionId: "version-1", directionId: "vue-frontend" }],
    { total_tokens: 88 },
  );

  const usage = database.get(COLLECTIONS.dailyUsage, usageId);
  assert.equal(usage.usedCount, 1);
  assert.equal(usage.reservedCount, 0);
  assert.deepEqual(usage.reservations, {});
  assert.equal(database.get(COLLECTIONS.generationTasks, taskId).status, "COMPLETED");
  assert.equal(database.get(COLLECTIONS.resumeVersions, "version-1").ownerId, OWNER_ID);
});

test("生成失败时释放预留且不扣每日额度", async () => {
  const database = new InMemoryDatabase();
  const repository = new CareerRepository(database);
  const date = "2026-09-16";
  const taskId = `task_${"c".repeat(40)}`;
  await repository.reserveGeneration(OWNER_ID, date, {
    analysisId: "analysis-1",
    selectedDirectionIds: ["vue-frontend"],
    taskId,
  });

  await repository.failGeneration(OWNER_ID, date, taskId, "MODEL_TIMEOUT");

  const usageId = `${OWNER_ID}_${date}`;
  const usage = database.get(COLLECTIONS.dailyUsage, usageId);
  const task = database.get(COLLECTIONS.generationTasks, taskId);
  assert.equal(usage.usedCount, 0);
  assert.equal(usage.reservedCount, 0);
  assert.deepEqual(usage.reservations, {});
  assert.equal(task.status, "FAILED");
  assert.equal(task.errorCode, "MODEL_TIMEOUT");
});

test("草稿输入只接受有界标题、段落和打招呼语", () => {
  const input = validateResumeDraft({
    expectedRevision: 1,
    greetings: ["  您好，希望进一步沟通。  "],
    resumeTitle: "  前端开发简历  ",
    sectionTexts: ["  使用 Vue 完成管理系统  "],
    versionId: VERSION_ID,
  });
  assert.equal(input.resumeTitle, "前端开发简历");
  assert.deepEqual(input.sectionTexts, ["使用 Vue 完成管理系统"]);
  assert.deepEqual(input.greetings, ["您好，希望进一步沟通。"]);
  assert.deepEqual(validateConfirmResumeVersion({ expectedRevision: 2, versionId: VERSION_ID }), {
    expectedRevision: 2,
    versionId: VERSION_ID,
  });
  assert.throws(
    () => validateResumeDraft({
      expectedRevision: 1,
      greetings: ["您好"],
      resumeTitle: "前端开发简历",
      sectionTexts: ["   "],
      versionId: VERSION_ID,
    }),
    (error) => error instanceof AppError && error.code === "INVALID_RESUME_SECTION",
  );
});

test("保存草稿保留事实元数据并用修订号阻止旧内容覆盖", async () => {
  const database = new InMemoryDatabase();
  const repository = new CareerRepository(database);
  await database.collection(COLLECTIONS.resumeVersions).doc(VERSION_ID).set({
    data: {
      directionId: "vue-frontend",
      greetings: ["原打招呼语"],
      ownerId: OWNER_ID,
      resumeTitle: "原标题",
      revision: 1,
      sections: [{
        changeType: "rewrite",
        factIds: ["fact-001"],
        language: "zh-CN",
        section: "项目经历",
        text: "原内容",
      }],
      status: "DRAFT",
      versionId: VERSION_ID,
    },
  });

  const updated = await repository.updateResumeDraft(OWNER_ID, {
    expectedRevision: 1,
    greetings: ["新打招呼语"],
    resumeTitle: "新标题",
    sectionTexts: ["新内容"],
    versionId: VERSION_ID,
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.sections[0].text, "新内容");
  assert.deepEqual(updated.sections[0].factIds, ["fact-001"]);
  assert.equal(updated.sections[0].changeType, "rewrite");
  const repeated = await repository.updateResumeDraft(OWNER_ID, {
    expectedRevision: 1,
    greetings: ["新打招呼语"],
    resumeTitle: "新标题",
    sectionTexts: ["新内容"],
    versionId: VERSION_ID,
  });
  assert.equal(repeated.revision, 2);
  assert.equal(database.get(COLLECTIONS.resumeVersions, VERSION_ID).revision, 2);
  await assert.rejects(
    () => repository.updateResumeDraft(OWNER_ID, {
      expectedRevision: 1,
      greetings: ["旧页面打招呼语"],
      resumeTitle: "旧页面标题",
      sectionTexts: ["旧页面内容"],
      versionId: VERSION_ID,
    }),
    (error) => error instanceof AppError && error.code === "RESUME_VERSION_CONFLICT",
  );
});

test("旧版本缺少状态与修订号时可兼容保存并确认", async () => {
  const database = new InMemoryDatabase();
  const repository = new CareerRepository(database);
  await database.collection(COLLECTIONS.resumeVersions).doc(VERSION_ID).set({
    data: {
      greetings: ["原打招呼语"],
      ownerId: OWNER_ID,
      resumeTitle: "原标题",
      sections: [{ section: "项目经历", text: "原内容" }],
      versionId: VERSION_ID,
    },
  });

  const updated = await repository.updateResumeDraft(OWNER_ID, {
    expectedRevision: 1,
    greetings: ["新打招呼语"],
    resumeTitle: "新标题",
    sectionTexts: ["新内容"],
    versionId: VERSION_ID,
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.status, "DRAFT");

  const confirmed = await repository.confirmResumeVersion(OWNER_ID, {
    expectedRevision: 2,
    versionId: VERSION_ID,
  });
  assert.equal(confirmed.revision, 3);
  assert.equal(confirmed.status, "CONFIRMED");
});

test("其他用户不能保存或确认简历版本", async () => {
  const database = new InMemoryDatabase();
  const repository = new CareerRepository(database);
  await database.collection(COLLECTIONS.resumeVersions).doc(VERSION_ID).set({
    data: {
      greetings: ["您好，希望进一步沟通。"],
      ownerId: OWNER_ID,
      resumeTitle: "前端开发简历",
      revision: 1,
      sections: [{ section: "项目经历", text: "使用 Vue 完成管理系统" }],
      status: "DRAFT",
      versionId: VERSION_ID,
    },
  });
  const otherOwnerId = "b".repeat(32);

  await assert.rejects(
    () => repository.updateResumeDraft(otherOwnerId, {
      expectedRevision: 1,
      greetings: ["不能修改"],
      resumeTitle: "不能修改",
      sectionTexts: ["不能修改"],
      versionId: VERSION_ID,
    }),
    (error) => error instanceof AppError && error.code === "RESOURCE_FORBIDDEN",
  );
  await assert.rejects(
    () => repository.confirmResumeVersion(otherOwnerId, {
      expectedRevision: 1,
      versionId: VERSION_ID,
    }),
    (error) => error instanceof AppError && error.code === "RESOURCE_FORBIDDEN",
  );
});

test("确认导出基线后版本锁定且重复确认保持幂等", async () => {
  const database = new InMemoryDatabase();
  const repository = new CareerRepository(database);
  await database.collection(COLLECTIONS.resumeVersions).doc(VERSION_ID).set({
    data: {
      greetings: ["您好，希望进一步沟通。"],
      ownerId: OWNER_ID,
      resumeTitle: "前端开发简历",
      revision: 2,
      sections: [{ section: "项目经历", text: "使用 Vue 完成管理系统" }],
      status: "DRAFT",
      versionId: VERSION_ID,
    },
  });

  const confirmed = await repository.confirmResumeVersion(OWNER_ID, {
    expectedRevision: 2,
    versionId: VERSION_ID,
  });
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.revision, 3);
  const repeated = await repository.confirmResumeVersion(OWNER_ID, {
    expectedRevision: 2,
    versionId: VERSION_ID,
  });
  assert.equal(repeated.revision, 3);
  await assert.rejects(
    () => repository.updateResumeDraft(OWNER_ID, {
      expectedRevision: 3,
      greetings: ["不能修改"],
      resumeTitle: "不能修改",
      sectionTexts: ["不能修改"],
      versionId: VERSION_ID,
    }),
    (error) => error instanceof AppError && error.code === "RESUME_VERSION_CONFIRMED",
  );
});

test("导出请求只接受四个固定模板与合法版本编号", () => {
  assert.deepEqual(
    validateRenderResumeFiles({ templateId: "technical-project", versionId: VERSION_ID }),
    { templateId: "technical-project", versionId: VERSION_ID },
  );
  assert.throws(
    () => validateRenderResumeFiles({ templateId: "unknown", versionId: VERSION_ID }),
    (error) => error instanceof AppError && error.code === "INVALID_RESUME_TEMPLATE",
  );
});

test("渲染响应校验文件签名、页数与预览数量", () => {
  const rendered = normalizeRenderedFiles({
    ok: true,
    data: {
      docxBase64: Buffer.from("PK-test-docx").toString("base64"),
      pageCount: 1,
      pdfBase64: Buffer.from("%PDF-test-pdf").toString("base64"),
      previewBase64: [Buffer.from([0xff, 0xd8, 0xff, 0x01]).toString("base64")],
    },
  });
  assert.equal(rendered.pageCount, 1);
  assert.equal(rendered.docx.subarray(0, 2).toString(), "PK");
  assert.throws(
    () => normalizeRenderedFiles({
      ok: true,
      data: {
        docxBase64: Buffer.from("not-a-docx").toString("base64"),
        pageCount: 1,
        pdfBase64: Buffer.from("%PDF-test-pdf").toString("base64"),
        previewBase64: [Buffer.from([0xff, 0xd8, 0xff, 0x01]).toString("base64")],
      },
    }),
    (error) => error instanceof AppError && error.code === "RENDERER_INVALID_RESPONSE",
  );
});

test("只有本人已确认版本可导出且导出不触碰生成额度", async () => {
  const version = {
    contactBlock: "邮箱 user@example.com",
    greetings: ["您好，希望进一步沟通。"],
    language: "zh-CN",
    ownerId: OWNER_ID,
    resumeTitle: "前端开发简历",
    revision: 3,
    roleName: "Vue.js前端",
    sections: [{ section: "项目经历", text: "使用 Vue 完成管理系统" }],
    status: "CONFIRMED",
    versionId: VERSION_ID,
  };
  let renderCalls = 0;
  let saveCalls = 0;
  const repository = {
    async getUser() {
      return {
        confirmedResume: { text: "使用 Vue 完成管理系统" },
        consentVersion: "2026-09-15",
      };
    },
    async getVersion() { return version; },
  };
  const documentRenderer = {
    async render(receivedVersion, templateId) {
      renderCalls += 1;
      assert.equal(receivedVersion, version);
      assert.equal(templateId, "minimal-general");
      return { docx: Buffer.from("PK"), pageCount: 1, pdf: Buffer.from("%PDF"), previews: [Buffer.from([0xff, 0xd8, 0xff])] };
    },
  };
  const exportFileStore = {
    async save(ownerId, receivedVersion, template, templateId) {
      saveCalls += 1;
      assert.equal(ownerId, OWNER_ID);
      assert.equal(receivedVersion, version);
      assert.equal(template.name, "极简通用");
      assert.equal(templateId, "minimal-general");
      return {
        files: {
          docx: { fileID: "docx", fileName: "简历.docx", tempUrl: "https://example.test/resume.docx" },
          pdf: { fileID: "pdf", fileName: "简历.pdf", tempUrl: "https://example.test/resume.pdf" },
        },
        previewUrls: ["https://example.test/preview.jpg"],
      };
    },
  };
  const result = await new CareerService(
    repository,
    null,
    documentRenderer,
    exportFileStore,
  ).renderResumeFiles(OWNER_ID, { templateId: "minimal-general", versionId: VERSION_ID });
  assert.equal(result.exportId, `${VERSION_ID}:3:minimal-general`);
  assert.equal(result.templateName, "极简通用");
  assert.deepEqual(result.greetings, version.greetings);
  assert.equal(renderCalls, 1);
  assert.equal(saveCalls, 1);

  version.status = "DRAFT";
  await assert.rejects(
    () => new CareerService(repository, null, documentRenderer, exportFileStore)
      .renderResumeFiles(OWNER_ID, { templateId: "minimal-general", versionId: VERSION_ID }),
    (error) => error instanceof AppError && error.code === "RESUME_VERSION_NOT_CONFIRMED",
  );
  assert.equal(renderCalls, 1);
});

test("导出文件使用隔离路径并返回同序临时链接", async () => {
  const uploadedPaths = [];
  const cloudApi = {
    async uploadFile({ cloudPath }) {
      uploadedPaths.push(cloudPath);
      return { fileID: `cloud://${cloudPath}` };
    },
    async getTempFileURL({ fileList }) {
      return {
        fileList: fileList.map(({ fileID }) => ({
          errMsg: "ok",
          fileID,
          maxAge: 3600,
          status: 0,
          tempFileURL: `https://example.test/${encodeURIComponent(fileID)}`,
        })),
      };
    },
    async deleteFile() {
      throw new Error("should not clean successful upload");
    },
  };
  const result = await new ExportFileStore(cloudApi).save(
    OWNER_ID,
    { resumeTitle: "前端/开发简历", revision: 3, versionId: VERSION_ID },
    { name: "技术项目" },
    "technical-project",
    {
      docx: Buffer.from("PK"),
      pdf: Buffer.from("%PDF"),
      previews: [Buffer.from([0xff, 0xd8, 0xff])],
    },
  );
  assert.deepEqual(uploadedPaths, [
    `resume-output/${OWNER_ID}/${VERSION_ID}/3/technical-project/resume.docx`,
    `resume-output/${OWNER_ID}/${VERSION_ID}/3/technical-project/resume.pdf`,
    `resume-output/${OWNER_ID}/${VERSION_ID}/3/technical-project/preview-1.jpg`,
  ]);
  assert.equal(result.files.docx.fileName, "前端_开发简历-技术项目.docx");
  assert.equal(result.previewUrls.length, 1);
});
