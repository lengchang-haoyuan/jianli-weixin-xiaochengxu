const https = require("node:https");
const {
  ANALYSIS_MODEL_RETRIES,
  ANALYSIS_MODEL_TIMEOUT_MS,
  GENERATION_MODEL_RETRIES,
  GENERATION_MODEL_TIMEOUT_MS,
} = require("./constants");
const { AppError } = require("./errors");

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const requestJson = (url, options = {}) =>
  new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method || "GET",
      headers: options.headers || {},
    });
    let settled = false;

    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const onAbort = () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      request.destroy(error);
    };

    request.on("response", (response) => {
      const chunks = [];
      let receivedBytes = 0;

      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          response.destroy(new Error("Model response exceeded the size limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", finishReject);
      response.on("end", () => {
        if (settled) {
          return;
        }
        settled = true;
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 0,
          json: async () => JSON.parse(text),
        });
      });
    });
    request.on("error", finishReject);
    request.on("close", () => {
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    });

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });

const ANALYSIS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["mappings"],
  properties: {
    mappings: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["directionId", "categoryScores", "evidence", "gaps"],
        properties: {
          directionId: { type: "string" },
          categoryScores: {
            type: "object",
            additionalProperties: false,
            required: [
              "technology_projects",
              "internship_work",
              "major_courses",
              "competition_certificates",
              "education_school",
            ],
            properties: {
              technology_projects: { type: "integer", minimum: 0, maximum: 100 },
              internship_work: { type: "integer", minimum: 0, maximum: 100 },
              major_courses: { type: "integer", minimum: 0, maximum: 100 },
              competition_certificates: { type: "integer", minimum: 0, maximum: 100 },
              education_school: { type: "integer", minimum: 0, maximum: 100 },
            },
          },
          evidence: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["category", "criterion", "quote"],
              properties: {
                category: {
                  type: "string",
                  enum: [
                    "technology_projects",
                    "internship_work",
                    "major_courses",
                    "competition_certificates",
                    "education_school",
                  ],
                },
                criterion: { type: "string", maxLength: 80 },
                quote: { type: "string", minLength: 1, maxLength: 240 },
              },
            },
          },
          gaps: {
            type: "array",
            maxItems: 3,
            items: { type: "string", maxLength: 120 },
          },
        },
      },
    },
  },
});

const GENERATION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["packages"],
  properties: {
    packages: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["directionId", "resumeTitle", "sections", "greetings"],
        properties: {
          directionId: { type: "string" },
          resumeTitle: { type: "string" },
          sections: {
            type: "array",
            minItems: 2,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["section", "text", "factIds", "changeType", "language"],
              properties: {
                section: { type: "string" },
                text: { type: "string" },
                factIds: { type: "array", minItems: 1, maxItems: 24, items: { type: "string" } },
                changeType: { type: "string", enum: ["rewrite", "reorder", "translate"] },
                language: { type: "string", enum: ["zh-CN", "en", "bilingual"] },
              },
            },
          },
          greetings: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
        },
      },
    },
  },
});

const createGenerationSchema = (input) => {
  const schema = JSON.parse(JSON.stringify(GENERATION_SCHEMA));
  const packages = schema.properties.packages;
  const directionIds = Array.isArray(input?.directions)
    ? input.directions.map((direction) => direction?.directionId).filter(Boolean)
    : [];
  const factIds = Array.isArray(input?.facts)
    ? input.facts.map((fact) => fact?.id).filter(Boolean)
    : [];

  if (directionIds.length > 0) {
    packages.minItems = directionIds.length;
    packages.maxItems = directionIds.length;
    packages.items.properties.directionId.enum = directionIds;
  }
  const sectionProperties = packages.items.properties.sections.items.properties;
  if (factIds.length > 0) {
    sectionProperties.factIds.items.enum = factIds;
  }
  if (["zh-CN", "en", "bilingual"].includes(input?.language)) {
    sectionProperties.language.enum = [input.language];
  }
  return schema;
};

const getOutputText = (response) => {
  if (!response || response.status !== "completed" || !Array.isArray(response.output)) {
    return { text: "", partCount: 0 };
  }
  const parts = [];
  for (const item of response.output) {
    if (item && item.type === "message" && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (content && content.type === "output_text" && typeof content.text === "string") {
          parts.push(content.text);
        }
      }
    }
  }
  return { text: parts.join(""), partCount: parts.length };
};

const extractJsonObjectCandidates = (text) => {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start < 0) {
      if (character === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
};

const parseStructuredOutput = (outputText) => {
  const normalized = outputText.trim().replace(/^\uFEFF/, "");
  const fencedMatch = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidates = fencedMatch ? [normalized, fencedMatch[1]] : [normalized];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      // 继续检查说明文字中是否仅包含一个完整 JSON 对象。
    }
  }

  const embeddedObjects = extractJsonObjectCandidates(fencedMatch ? fencedMatch[1] : normalized)
    .map((candidate) => {
      try {
        return JSON.parse(candidate);
      } catch (_error) {
        return null;
      }
    })
    .filter((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate));
  if (embeddedObjects.length === 1) {
    return embeddedObjects[0];
  }

  throw new AppError("MODEL_OUTPUT_INVALID", "AI 返回格式无法解析，本次未保存。");
};

class DeepSeekProvider {
  constructor({ apiKey = process.env.DEEPSEEK_API_KEY, fetchImpl = requestJson, model = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro" } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.model = model;
  }

  assertConfigured() {
    if (!this.apiKey || typeof this.fetchImpl !== "function") {
      throw new AppError("MODEL_NOT_CONFIGURED", "AI 服务尚未配置，请联系管理员完成 DeepSeek 密钥设置。");
    }
    if (!/^(deepseek-flash|deepseek-v4-pro)$/.test(this.model)) {
      throw new AppError("MODEL_NOT_CONFIGURED", "AI 模型配置无效，请联系管理员检查环境变量。");
    }
  }

  async requestStructured({
    input,
    instructions,
    maxOutputTokens,
    maxRetries,
    name,
    reasoningEffort,
    schema,
    temperature,
    timeoutMs,
  }) {
    this.assertConfigured();
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetchImpl("https://api.deepseek.com/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            instructions,
            input,
            reasoning: { effort: reasoningEffort },
            max_output_tokens: maxOutputTokens,
            temperature,
            text: { format: { type: "json_schema", name, schema } },
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
            continue;
          }
          throw new AppError("MODEL_UNAVAILABLE", "AI 服务暂时不可用，本次未扣减额度，请稍后重试。");
        }
        const payload = await response.json();
        if (!payload || payload.status !== "completed") {
          const reason = payload?.incomplete_details?.reason;
          throw new AppError(
            "MODEL_OUTPUT_INVALID",
            reason === "max_output_tokens"
              ? "AI 返回内容超过长度限制，本次未保存。"
              : "AI 返回内容不完整，本次未保存。",
          );
        }
        const output = getOutputText(payload);
        if (!output.text) {
          throw new AppError("MODEL_OUTPUT_INVALID", "AI 返回内容不完整，本次未保存。");
        }
        let data;
        try {
          data = parseStructuredOutput(output.text);
        } catch (error) {
          console.warn("MODEL_OUTPUT_PARSE_FAILED", {
            responseId: typeof payload.id === "string" ? payload.id : null,
            partCount: output.partCount,
            textLength: output.text.length,
          });
          throw error;
        }
        return { data, usage: payload.usage || null };
      } catch (error) {
        lastError = error;
        if (error instanceof AppError) {
          if (error.code === "MODEL_UNAVAILABLE" || attempt >= maxRetries) {
            throw error;
          }
          continue;
        }
        if (attempt >= maxRetries) {
          break;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    if (lastError && lastError.name === "AbortError") {
      throw new AppError("MODEL_TIMEOUT", "AI 服务暂时超时，本次未完成，可稍后重试。");
    }
    throw new AppError("MODEL_OUTPUT_INVALID", "AI 返回内容未通过格式校验，本次未保存。");
  }

  analyzeRoles(input) {
    return this.requestStructured({
      name: "role_match_analysis",
      schema: ANALYSIS_SCHEMA,
      maxOutputTokens: 6000,
      maxRetries: ANALYSIS_MODEL_RETRIES,
      reasoningEffort: "none",
      temperature: 0.2,
      timeoutMs: ANALYSIS_MODEL_TIMEOUT_MS,
      instructions:
        "你是简历岗位证据映射器。先比较standard中的全部岗位方向，只输出证据最充分的3个不同方向。只把用户已确认事实映射到给定岗位标准，不联网，不推断未出现的技能、数字、身份或经历。evidence.quote必须逐字来自resumeText，criterion与gaps保持简洁。学校层次不得作为淘汰依据。输出JSON。",
      input: JSON.stringify(input),
    });
  }

  generateResumePackages(input) {
    return this.requestStructured({
      name: "resume_generation_packages",
      schema: createGenerationSchema(input),
      maxOutputTokens: 12000,
      maxRetries: GENERATION_MODEL_RETRIES,
      reasoningEffort: "none",
      temperature: 0.2,
      timeoutMs: GENERATION_MODEL_TIMEOUT_MS,
      instructions:
        "你是事实受限的简历改写器。只能使用facts中给出的内容，每个段落必须引用真实factIds；禁止补写未确认技能、项目、数字、日期、公司或学历，段落文本不要添加序号。section.text中的数字、日期、百分比和金额必须逐字复用所引用facts里的表达，不得换算、补全或把英文月份改成数字。无法安全改写时原样保留事实文本。社招模式不得使用应届生措辞。打招呼语不得虚构具体公司或JD要求。按指定语言输出JSON。",
      input: JSON.stringify(input),
    });
  }
}

module.exports = { DeepSeekProvider };
