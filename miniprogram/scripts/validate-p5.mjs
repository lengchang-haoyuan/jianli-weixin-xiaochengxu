import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const readText = (relativePath) => readFile(path.join(projectRoot, relativePath), "utf8");

const [
  constants,
  functionEntry,
  repository,
  service,
  validators,
  cloudApi,
  domainTypes,
  editorLogic,
  editorStyles,
  editorTemplate,
  rendererClient,
  exportFileStore,
  templateLogic,
  templateStyles,
  templateView,
  resultLogic,
  resultStyles,
  resultView,
  renderer,
  rendererServer,
  dockerfile,
] = await Promise.all([
  readText("cloudfunctions/careerAssistant/constants.js"),
  readText("cloudfunctions/careerAssistant/index.js"),
  readText("cloudfunctions/careerAssistant/repository.js"),
  readText("cloudfunctions/careerAssistant/career-service.js"),
  readText("cloudfunctions/careerAssistant/validators.js"),
  readText("miniprogram/services/cloud-api.ts"),
  readText("miniprogram/types/domain.ts"),
  readText("miniprogram/pages/editor/index.ts"),
  readText("miniprogram/pages/editor/index.less"),
  readText("miniprogram/pages/editor/index.wxml"),
  readText("cloudfunctions/careerAssistant/document-renderer-client.js"),
  readText("cloudfunctions/careerAssistant/export-file-store.js"),
  readText("miniprogram/pages/templates/index.ts"),
  readText("miniprogram/pages/templates/index.less"),
  readText("miniprogram/pages/templates/index.wxml"),
  readText("miniprogram/pages/result/index.ts"),
  readText("miniprogram/pages/result/index.less"),
  readText("miniprogram/pages/result/index.wxml"),
  readText("cloudrun/documentRenderer/renderer.py"),
  readText("cloudrun/documentRenderer/server.py"),
  readText("cloudrun/documentRenderer/Dockerfile"),
]);

assert.match(functionEntry, /case "updateResumeDraft"/);
assert.match(functionEntry, /case "confirmResumeVersion"/);
assert.match(service, /validateResumeDraft/);
assert.match(service, /validateConfirmResumeVersion/);
assert.match(repository, /RESUME_VERSION_CONFLICT/);
assert.match(repository, /RESUME_VERSION_CONFIRMED/);
assert.match(repository, /hasSameDraftContent/);
assert.match(repository, /\.\.\.section,[\s\S]*text: input\.sectionTexts\[index\]/);
assert.match(repository, /status: "CONFIRMED"/);
assert.match(validators, /MAX_RESUME_SECTION_CHARACTERS/);
assert.match(constants, /MAX_RESUME_SECTIONS: 20/);
assert.match(cloudApi, /callCareerAssistant\("updateResumeDraft"/);
assert.match(cloudApi, /callCareerAssistant\("confirmResumeVersion"/);
assert.match(domainTypes, /ResumeVersionStatus = "DRAFT" \| "CONFIRMED"/);
assert.match(editorLogic, /updateCachedVersion/);
assert.match(editorLogic, /replaceVersion/);
assert.match(editorLogic, /reloadTask/);
assert.match(editorLogic, /enableAlertBeforeUnload/);
assert.match(editorTemplate, /bindinput="onSectionInput"/);
assert.match(editorTemplate, /确认导出基线/);
assert.match(editorTemplate, /disable-touch="\{\{operation \? true : false\}\}"/);
assert.match(editorTemplate, /wx:key="viewKey"/);
assert.match(editorTemplate, /wx:if="\{\{!loading && versions\.length > 0\}\}"/);
assert.doesNotMatch(editorTemplate, /<swiper wx:else/);
assert.doesNotMatch(editorTemplate, /wx:key="\*this"/);
assert.doesNotMatch(editorLogic, /versions\[this\.data\.currentIndex\] = toVersionView/);
assert.doesNotMatch(editorStyles, /height:\s*9(?:70|90)rpx/);
assert.doesNotMatch(constants, /resumeDrafts|exportBaselines/);
assert.match(functionEntry, /case "renderResumeFiles"/);
assert.match(service, /version\.status !== "CONFIRMED"/);
assert.match(service, /documentRenderer\.render/);
assert.match(service, /exportFileStore\.save/);
assert.match(validators, /validateRenderResumeFiles/);
assert.match(constants, /RESUME_TEMPLATES/);
assert.match(rendererClient, /callContainer/);
assert.match(rendererClient, /Buffer\.from\("%PDF"\)/);
assert.match(exportFileStore, /resume-output\/\$\{ownerId\}\/\$\{version\.versionId\}\/\$\{version\.revision\}/);
assert.match(exportFileStore, /getTempFileURL/);
assert.match(exportFileStore, /deleteFile/);
assert.match(cloudApi, /callCareerAssistant\("renderResumeFiles"/);
assert.match(domainTypes, /ResumeExportBundle/);
assert.match(editorTemplate, /选择模板并导出/);
assert.match(templateLogic, /renderSelectedTemplate/);
assert.match(templateLogic, /getGenerationTask/);
assert.match(templateView, /四套原创 A4 模板/);
assert.match(templateView, /生成 DOCX 与 PDF/);
assert.match(templateStyles, /template-card--selected/);
assert.match(resultLogic, /openExportFile/);
assert.match(resultLogic, /setClipboardData/);
assert.match(resultView, /切换模板并重新导出/);
assert.match(resultView, /导出不会扣减/);
assert.match(resultStyles, /preview-page/);
assert.match(renderer, /w:pgSz w:w=\"11906\" w:h=\"16838\"/);
assert.match(renderer, /subprocess\.run/);
assert.doesNotMatch(renderer, /shell=True/);
assert.match(rendererServer, /Cache-Control/);
assert.match(rendererServer, /def log_message/);
assert.match(dockerfile, /libreoffice-writer/);
assert.match(dockerfile, /USER appuser/);

console.log("P5.2 结构静态校验通过：确认基线、四模板、私有渲染、文件校验、预览下载与打招呼语均已接入。");
