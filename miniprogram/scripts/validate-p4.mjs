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
  "cloudfunctions/careerAssistant/index.js",
  "cloudfunctions/careerAssistant/model-provider.js",
  "cloudfunctions/careerAssistant/career-standard.v1.json",
  "miniprogram/pages/preferences/index.less",
  "miniprogram/pages/questionnaire/index.less",
  "miniprogram/pages/progress/index.less",
  "miniprogram/pages/editor/index.less",
  "tests/cloudfunctions/career-assistant.test.js",
]) {
  assert.equal(await exists(relativePath), true, `${relativePath} 不存在`);
}

const standard = await readJson("cloudfunctions/careerAssistant/career-standard.v1.json");
const questionnaire = await readJson("cloudfunctions/careerAssistant/questionnaire.v1.json");
const weights = await readJson("cloudfunctions/careerAssistant/scoring-weights.v1.json");
const packageJson = await readJson("cloudfunctions/careerAssistant/package.json");
const clientConfig = await readText("miniprogram/config/app-config.ts");
const cloudApi = await readText("miniprogram/services/cloud-api.ts");
const provider = await readText("cloudfunctions/careerAssistant/model-provider.js");
const privacy = await readText("cloudfunctions/careerAssistant/privacy.js");
const userService = await readText("cloudfunctions/userCenter/user-service.js");
const userRepository = await readText("cloudfunctions/userCenter/repository.js");
const p4Pages = await Promise.all(
  ["preferences", "questionnaire", "recommendations", "progress", "editor"].map((page) =>
    readText(`miniprogram/pages/${page}/index.ts`),
  ),
);

assert.equal(standard.categories.flatMap((category) => category.directions).length, 66);
assert.equal(questionnaire.questions.length, 12);
for (const profile of Object.values(weights.profiles)) {
  assert.equal(Object.values(profile.weights).reduce((sum, value) => sum + value, 0), 100);
}
assert.equal(packageJson.engines.node, ">=16.13.0");
assert.deepEqual(packageJson.dependencies, {
  "@cloudbase/node-sdk": "3.17.2",
  "wx-server-sdk": "4.0.2",
});
assert.match(clientConfig, /CAREER_ASSISTANT_FUNCTION = "careerAssistant"/);
assert.match(cloudApi, /generateResumePackage/);
assert.match(provider, /https:\/\/api\.deepseek\.com\/responses/);
assert.match(provider, /require\("node:https"\)/);
assert.match(provider, /json_schema/);
assert.match(provider, /process\.env\.DEEPSEEK_API_KEY/);
assert.doesNotMatch(provider, /Bearer\s+[A-Za-z0-9_-]{16,}/);
assert.match(privacy, /邮箱已移除/);
assert.match(privacy, /电话已移除/);
assert.match(userService, /countActiveReservations/);
assert.match(userRepository, /deleteAllCareerData/);
assert.doesNotMatch(p4Pages.join("\n"), /尚未启用|P4 开放/);

const functionEntries = await readdir(path.join(projectRoot, "cloudfunctions", "careerAssistant"), {
  withFileTypes: true,
});
assert.equal(
  functionEntries.some((entry) => entry.isDirectory()),
  false,
  "稳定版微信开发者工具CLI不能正确打包云函数子目录",
);

console.log("P4 静态校验通过：固定标准、隐私脱敏、结构化模型边界、额度与五个页面完整。 ");
