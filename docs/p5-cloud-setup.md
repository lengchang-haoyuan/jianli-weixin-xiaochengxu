# P5 云端配置与验收

P5.1负责版本编辑与确认，P5.2负责把当前用户已经确认的简历版本渲染为DOCX、PDF和逐页JPEG预览。模板切换与重复导出不调用DeepSeek，也不扣减每日完整生成额度。

## 当前状态（2026-09-21）

- P5.1与P5.2源码、自动化测试和本地A4文档样例均已完成。
- `careerAssistant` 增加了 `renderResumeFiles` 动作，只接受当前用户拥有且状态为 `CONFIRMED` 的版本。
- 四套原创模板为：极简通用、技术项目、校招成长、社招经历。
- 文档渲染服务源码位于 `miniprogram/cloudrun/documentRenderer`，使用LibreOffice生成PDF，并使用Poppler生成逐页JPEG预览。
- 云托管服务仍需在当前环境创建并部署；未完成本节操作前，线上导出会失败，这是部署未完成，不是DeepSeek问题。

## 1. 创建私有云托管服务

在环境 `cloud1-d8gpr3vf9f371184f` 中创建云托管服务：

1. 服务名填写 `resume-renderer`。
2. 构建方式选择Dockerfile，代码目录选择 `miniprogram/cloudrun/documentRenderer`。
3. 服务端口填写 `8080`，健康检查路径填写 `/health`。
4. 初始实例数可设为0，最大实例数按套餐和并发预算设置；本阶段不需要固定公网IP。
5. 部署完成后，关闭该服务的公网访问。小程序端不得直接访问渲染服务，只允许同一CloudBase环境中的 `careerAssistant` 通过 `callContainer` 调用。

CloudBase官方说明：云托管公网访问默认开启且默认无需鉴权；关闭公网访问不会影响小程序和云函数通过CloudBase私有链路调用。参考：

- https://docs.cloudbase.net/run/deploy/networking/public
- https://docs.cloudbase.net/run/deploy/service-setting
- https://docs.cloudbase.net/api-reference/server/node-sdk/cloudrun

如果服务名不是 `resume-renderer`，在 `careerAssistant` 的环境变量中增加：

```text
DOCUMENT_RENDERER_SERVICE=<实际服务名>
```

不要在环境变量、源码或聊天中传递用户简历正文；渲染服务不需要任何DeepSeek密钥。

## 2. 更新既有云函数

`careerAssistant` 已存在，必须更新现有 `$LATEST` 代码，不能再次走“创建云函数”，也不需要创建新版本。上传时选择云端安装依赖；运行时继续使用当前Node.js 16.13即可，超时保持60秒。

命令行更新方式：

```powershell
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' cloud functions deploy `
  --env cloud1-d8gpr3vf9f371184f `
  --names careerAssistant `
  --remote-npm-install `
  --project 'C:\Users\Administrator\Desktop\小程序\miniprogram' `
  --lang zh
```

部署目录中不要提交本地 `node_modules`。P5.2直接声明 `@cloudbase/node-sdk 3.17.2`，用于服务端 `callContainer`；其版本与现有 `wx-server-sdk 4.0.2` 依赖树一致。

## 3. 验收顺序

1. 访问渲染服务健康检查，确认返回 `200` 和健康状态。
2. 在小程序中生成或打开一个简历版本，完成编辑并点击“确认并完成”。
3. 点击“选择模板并导出”，任选一套模板。
4. 页面应显示每页JPEG预览，并可分别打开DOCX与PDF；打开文档后使用微信原生菜单保存或转发。
5. 复制该方向的打招呼语，确认剪贴板文本与页面一致。
6. 返回切换另一套模板并重新导出，确认每日完整生成额度不变，且没有新增DeepSeek调用。
7. 检查云存储路径，文件应位于 `resume-output/{ownerId}/{versionId}/{revision}/{templateId}/`，不同用户、版本、修订和模板互不覆盖。
8. 确认渲染服务公网访问保持关闭，且服务日志没有打印请求正文或简历内容。

## 4. 常见错误

- `VERSION_NOT_CONFIRMED`：版本尚未确认，先回到编辑页完成确认。
- `VERSION_NOT_FOUND`：版本不存在或不属于当前用户；服务端不会透露其他用户版本。
- `DOCUMENT_RENDERER_FAILED`：渲染服务未部署、服务名不一致、容器未就绪或LibreOffice转换失败。
- `DOCUMENT_RENDERER_INVALID_RESPONSE`：渲染服务返回的文件签名、页数或大小不符合约束，不会写入云存储。
- `DOCUMENT_EXPORT_FAILED`：云存储上传或临时链接生成失败；已上传的本次文件会尽量清理。

## 5. 回滚

- 回退 `careerAssistant` 到上一份已验证代码即可停止P5.2接口，不需要修改数据库结构。
- 云托管服务可先缩容至0；确认不再使用后再删除服务。删除属于不可恢复操作，应另行确认。
- `resume-output/` 中已生成文件属于用户数据，不应批量删除；如需清理，应按明确的用户、版本和模板路径执行并先确认目标。
