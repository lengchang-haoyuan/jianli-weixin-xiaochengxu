import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.join(projectRoot, "miniprogram");

const readText = (relativePath) => readFile(path.join(projectRoot, relativePath), "utf8");
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));
const exists = async (filePath) => {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const appConfig = await readJson("miniprogram/app.json");
const projectConfig = await readJson("project.config.json");
const requiredPages = [
  "index",
  "privacy",
  "upload",
  "review",
  "preferences",
  "questionnaire",
  "supplement",
  "recommendations",
  "progress",
  "editor",
  "templates",
  "result",
  "history",
];

assert.deepEqual(projectConfig.setting.useCompilerPlugins, ["typescript", "less"]);
assert.equal(appConfig.pages.length, requiredPages.length);

for (const pageName of requiredPages) {
  const registeredPath = `pages/${pageName}/index`;
  assert.ok(appConfig.pages.includes(registeredPath), `${registeredPath} 未注册`);
  for (const extension of ["ts", "wxml", "json"]) {
    const pageFile = path.join(sourceRoot, "pages", pageName, `index.${extension}`);
    assert.equal(await exists(pageFile), true, `${pageFile} 不存在`);
  }
}

assert.equal(await exists(path.join(sourceRoot, "app.ts")), true);
assert.equal(await exists(path.join(sourceRoot, "app.js")), false);
assert.equal(await exists(path.join(sourceRoot, "app.less")), true);
assert.equal(await exists(path.join(sourceRoot, "app.wxss")), false);

const clientConfig = await readText("miniprogram/config/app-config.ts");
const appEntry = await readText("miniprogram/app.ts");
const serverConstants = await readText("cloudfunctions/userCenter/constants.js");
const homeMarkup = await readText("miniprogram/pages/index/index.wxml");
const cloudEntry = await readText("cloudfunctions/userCenter/index.js");
const databaseRules = await readJson("security/database-deny-client.rules.json");
const storageRules = await readJson("security/storage-deny-client.rules.json");

assert.match(clientConfig, /cloud1-[a-z0-9]+/i);
assert.match(clientConfig, /PRIVACY_VERSION = "2026-09-15"/);
assert.match(appEntry, /traceUser:\s*false/);
assert.match(serverConstants, /PRIVACY_VERSION: "2026-09-15"/);
assert.match(homeMarkup, /seed 9144d8a8/);
assert.match(homeMarkup, /rw-timetable-slide-rack/);
assert.match(cloudEntry, /wxContext\.OPENID/);
assert.doesNotMatch(cloudEntry, /openid\s*:/i);
assert.deepEqual(databaseRules, { read: false, write: false });
assert.equal(storageRules.read, false);
assert.equal(typeof storageRules.write, "string");
assert.match(storageRules.write, /resource\.openid == auth\.openid/);
assert.match(storageRules.write, /\^resume-input/);

const functionEntries = await readdir(path.join(projectRoot, "cloudfunctions", "userCenter"), {
  withFileTypes: true,
});
assert.equal(
  functionEntries.some((entry) => entry.isDirectory()),
  false,
  "稳定版微信开发者工具CLI不能正确打包云函数子目录",
);

const inspectedFiles = [appEntry, clientConfig, serverConstants, homeMarkup, cloudEntry].join("\n");
assert.doesNotMatch(inspectedFiles, /appsecret|deepseek_api_key|bearer\s+[a-z0-9_-]+/i);

console.log(`P2 回归校验通过：${requiredPages.length} 个页面，数据库直连关闭，云存储仅开放P3临时写入。`);
