# resume-renderer 云托管服务

P5.2 的私有文档渲染服务。它接收 `careerAssistant` 云函数发送的已确认简历内容，生成 A4 DOCX、PDF 与逐页 JPEG 预览；不调用 AI，也不记录请求正文。

## 部署约束

- 在与小程序相同的 CloudBase 环境中创建云托管服务，服务名建议使用 `resume-renderer`。
- 构建目录选择本目录，端口为 `8080`，健康检查路径为 `/health`。
- 关闭服务的公网访问，只允许同环境云函数通过CloudBase私有链路调用；小程序端不直接访问该服务。
- 如果使用其他服务名，在 `careerAssistant` 云函数配置环境变量 `DOCUMENT_RENDERER_SERVICE`。
- 云函数超时时间建议保留 60 秒；容器侧单次 LibreOffice 转换限制为 35 秒。

四套模板均由本项目原创定义，使用同一份已确认内容；切换模板和重复导出不会调用 DeepSeek，也不会扣减完整生成额度。
