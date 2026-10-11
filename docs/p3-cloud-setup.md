# P3 微信云开发配置

- 云环境：`cloud1-d8gpr3vf9f371184f`
- 新云函数：`resumeParser`
- 运行时要求：`Nodejs18.15`
- 云函数 SDK：`wx-server-sdk 4.0.2`（只用于新函数，不改动 `userCenter`）
- 数据集合：继续使用 `users`；不新增集合
- 文件：仅临时写入 `resume-input/`，提取结束后立即删除

## 部署云函数

云环境最高提供 Node.js 18.15，因此 PDF 文字提取直接使用兼容该运行时的 `pdfjs-dist 4.8.69`。函数目录中的 `.npmrc` 会排除文字提取不需要的 Canvas 可选依赖。在微信开发者工具中同步云函数列表后，右键 `resumeParser`，选择“上传并部署：云端安装依赖（不上传 node_modules）”。

如使用 CLI，可在项目目录运行：

```powershell
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' cloud functions deploy `
  --env cloud1-d8gpr3vf9f371184f `
  --names resumeParser `
  --remote-npm-install `
  --project 'C:\Users\Administrator\Desktop\小程序\miniprogram' `
  --lang zh --report_first --report
```

部署后在云开发控制台 → 云函数 → `resumeParser` → 配置中确认：

1. 运行环境为 `Nodejs18.15`；
2. 在线依赖安装成功；
3. 函数目录中没有本地 `node_modules`；
4. 建议超时时间不少于 20 秒、内存不少于 512MB。

## 设置云存储安全规则

进入云开发控制台 → 存储 → 权限设置 → 自定义安全规则，粘贴 `miniprogram/security/storage-deny-client.rules.json` 的完整内容并保存。规则效果：

- 客户端始终不可读取文件；
- 只有当前微信登录用户可以写入或删除自己创建的文件；
- 客户端只能在 `resume-input/` 路径写入 DOCX/PDF；
- 当前云存储规则运行器不使用 `resource.size`，10MB 上限由前端预检和云函数下载后的服务端校验执行；
- 云函数继续强制校验 `resume-input/<32位所有者标识>/<UUID>.docx|pdf` 完整路径和当前用户归属。

规则保存后通常需要等待 1–3 分钟生效。数据库的 `users` 与 `daily_usage` 继续保持“仅管理员可读写”。

## 验收顺序

1. 上传一份小于 10MB 的 DOCX，进入核对页并看到可编辑文字；
2. 在云存储中确认对应 `resume-input/` 原文件已删除；
3. 未勾选事实确认时，“确认并保存”保持禁用；
4. 勾选后保存，在 `users` 当前用户文档中出现 `confirmedResume`；
5. 上传扫描版 PDF，应提示改用带文字层 PDF 或 DOCX；
6. P3 全流程不应出现 DeepSeek 请求，也不扣减每日完整生成额度。
