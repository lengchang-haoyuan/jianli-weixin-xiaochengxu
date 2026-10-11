import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const readText = (relativePath) => readFile(path.join(projectRoot, relativePath), "utf8");
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));
const exists = async (relativePath) => {
  try {
    await access(path.join(projectRoot, relativePath), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

for (const relativePath of [
  "cloudfunctions/resumeParser/index.js",
  "cloudfunctions/resumeParser/extractor.js",
  "cloudfunctions/resumeParser/resume-service.js",
  "miniprogram/pages/upload/index.less",
  "miniprogram/pages/review/index.less",
  "tests/cloudfunctions/resume-parser.test.js",
]) {
  assert.equal(await exists(relativePath), true, `${relativePath} 不存在`);
}

const parserPackage = await readJson("cloudfunctions/resumeParser/package.json");
const storageRules = await readJson("security/storage-deny-client.rules.json");
const clientConfig = await readText("miniprogram/config/app-config.ts");
const appEntry = await readText("miniprogram/app.ts");
const cloudApi = await readText("miniprogram/services/cloud-api.ts");
const homePage = await readText("miniprogram/pages/index/index.ts");
const homeMarkup = await readText("miniprogram/pages/index/index.wxml");
const uploadPage = await readText("miniprogram/pages/upload/index.ts");
const uploadMarkup = await readText("miniprogram/pages/upload/index.wxml");
const reviewPage = await readText("miniprogram/pages/review/index.ts");
const reviewMarkup = await readText("miniprogram/pages/review/index.wxml");
const parserEntry = await readText("cloudfunctions/resumeParser/index.js");
const parserExtractor = await readText("cloudfunctions/resumeParser/extractor.js");
const parserService = await readText("cloudfunctions/resumeParser/resume-service.js");
const npmConfig = await readText("cloudfunctions/resumeParser/.npmrc");

assert.equal(parserPackage.engines.node, ">=18.15.0 <19");
assert.equal(parserPackage.dependencies.mammoth, "1.12.3");
assert.equal(parserPackage.dependencies["pdfjs-dist"], "4.8.69");
assert.equal(parserPackage.dependencies["pdf-parse"], undefined);
assert.equal(parserPackage.dependencies["wx-server-sdk"], "4.0.2");
assert.match(npmConfig, /^omit=optional\s*$/);
assert.equal(storageRules.read, false);
assert.equal(typeof storageRules.write, "string");
assert.match(storageRules.write, /resource\.openid == auth\.openid/);
assert.match(storageRules.write, /\^resume-input/);
assert.match(storageRules.write, /\\\.docx\$/);
assert.match(storageRules.write, /\\\.pdf\$/);
assert.doesNotMatch(storageRules.write, /resource\.size/);
assert.match(clientConfig, /MAX_RESUME_FILE_BYTES = 10 \* 1024 \* 1024/);
assert.match(appEntry, /resumeSaveNoticePending:\s*false/);
assert.match(cloudApi, /RESUME_PARSER_FUNCTION/);
assert.match(homePage, /resumeSaveNoticePending = false/);
assert.match(homeMarkup, /简历事实已保存/);
assert.match(homeMarkup, /不会扣减完整生成额度/);
assert.match(uploadPage, /chooseMessageFile/);
assert.match(uploadPage, /cleanupTemporaryFile/);
assert.match(uploadPage, /文件上传被云存储拒绝/);
assert.match(uploadMarkup, /本阶段不调用 DeepSeek/);
assert.match(reviewMarkup, /我已核对/);
assert.match(reviewPage, /resumeSaveNoticePending = true/);
assert.doesNotMatch(reviewPage, /showToast/);
assert.match(parserEntry, /wxContext\.OPENID/);
assert.match(parserExtractor, /MAX_FILE_BYTES/);
assert.match(parserService, /deleteTemporaryFile/);

const functionEntries = await readdir(path.join(projectRoot, "cloudfunctions", "resumeParser"), {
  withFileTypes: true,
});
assert.equal(
  functionEntries.some((entry) => entry.isDirectory()),
  false,
  "稳定版微信开发者工具CLI不能正确打包云函数子目录",
);

const inspected = [clientConfig, cloudApi, uploadPage, parserEntry, parserService].join("\n");
assert.doesNotMatch(inspected, /appsecret|deepseek_api_key|bearer\s+[a-z0-9_-]+/i);

console.log("P3 静态校验通过：上传限制、服务端归属校验、临时删除与人工确认边界完整。");
