# P2 / P3 安全规则

`database-deny-client.rules.json` 表示前端不可直接读写数据库。`storage-deny-client.rules.json` 保持客户端不可读取，只允许当前登录用户在 `resume-input/` 临时目录写入 DOCX/PDF。当前云存储规则运行器无法稳定执行 `resource.size`，因此 10MB 上限由前端预检和云函数下载后的服务端校验共同执行。

在微信云开发控制台中：

1. 将 `users` 与 `daily_usage` 两个集合的权限设为“仅管理员可读写”；
2. 将云存储权限切换为本目录文件中的自定义安全规则；
3. `userCenter` 处理 P2 数据，`resumeParser` 读取并删除临时原文件、保存用户确认后的文字。

云函数使用服务端权限访问数据库和临时文件。客户端不能下载简历文件；服务端还会校验文件不超过 10MB，且路径必须属于当前微信身份生成的任务目录并使用 UUID v4 文件名。
