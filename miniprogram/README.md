# 简历优化助手微信小程序

本目录是原生微信小程序与微信云开发工程。当前已实现 P2 至 P5.2 源码：隐私确认、微信身份隔离、每日额度、个人数据清空，DOCX/PDF 上传与事实确认，求职偏好、12题问卷、Top 3岗位匹配、1至3方向AI生成、事实引用核对、版本编辑确认，以及四套原创A4模板的DOCX/PDF导出与JPEG预览。

## 技术边界

- 小程序端：TypeScript + Less，使用微信开发者工具内置编译插件；没有第三方运行时组件库。
- 云函数：Node.js + `wx-server-sdk`，只从 `cloud.getWXContext()` 获取当前用户身份。
- 数据库：使用 `users`、`daily_usage` 及P4的五个业务集合，小程序端不可直接读写。
- 云存储：客户端不可读取；登录用户只能写入 `resume-input/` 下不超过 10MB 的 DOCX/PDF。云函数完成提取后立即删除原文件。
- 简历文字：只有用户在核对页明确确认后，才写入现有 `users.confirmedResume`；不新增集合。
- DeepSeek：仅由 `careerAssistant` 云函数调用 Responses API；联系方式先脱敏，API Key 只从云函数环境变量读取。
- 文档导出：只允许导出当前用户已确认的版本；`careerAssistant` 通过同环境私有云托管服务生成文件，再写入按用户、版本、修订和模板隔离的云存储路径。
- 模板切换：四套模板使用同一份已确认事实，不调用DeepSeek，也不占用每日完整生成额度。

## 本地校验

```powershell
node .\scripts\validate-p2.mjs
node --test .\tests\cloudfunctions\user-center.test.js
node .\scripts\validate-p3.mjs
node --test .\tests\cloudfunctions\resume-parser.test.js
node .\scripts\validate-p4.mjs
node --test .\tests\cloudfunctions\career-assistant.test.js
node .\scripts\validate-p5.mjs
python -m unittest discover -s .\tests\cloudrun -p 'test_*.py' -v
```

TypeScript 与 Less 由微信开发者工具编译。项目环境 ID 位于 `miniprogram/config/app-config.ts`，它不是 AppSecret。

## 云端配置

部署与安全规则步骤见项目文档：`..\docs\p2-cloud-setup.md`、`..\docs\p3-cloud-setup.md`、`..\docs\p4-cloud-setup.md` 与 `..\docs\p5-cloud-setup.md`。
