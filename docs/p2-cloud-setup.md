# P2 微信云开发配置

- 云环境：`cloud1-d8gpr3vf9f371184f`
- 云函数：`userCenter`
- 数据集合：`users`、`daily_usage`
- P2 不创建简历、问卷、匹配或导出相关集合。

## 部署云函数

在 `C:\Users\Administrator\Desktop\小程序\miniprogram` 目录运行：

```powershell
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' cloud functions deploy `
  --env cloud1-d8gpr3vf9f371184f `
  --names userCenter `
  --remote-npm-install `
  --project 'C:\Users\Administrator\Desktop\小程序\miniprogram'
```

部署前需在云开发控制台一次性创建 `users` 与 `daily_usage`。云函数的业务请求只读写既有集合，不在用户请求链路执行集合管理操作；未同意隐私前不会创建个人用户文档。

当前稳定版微信开发者工具 CLI 在云函数目录含子目录时会把目录误作文件并报 `EISDIR`。因此 `userCenter` 的运行模块保持在函数根目录，测试放在项目级 `tests/cloudfunctions`；不要把测试目录移回云函数目录。

## 设置安全规则

云开发控制台中执行：

1. 数据库 → `users` → 权限设置 → 仅管理员可读写；
2. 数据库 → `daily_usage` → 权限设置 → 仅管理员可读写；
3. 云存储 → 权限设置 → 所有用户不可读写。

本地规则参考位于：

- `miniprogram/security/database-deny-client.rules.json`
- `miniprogram/security/storage-deny-client.rules.json`

## 验收顺序

1. 编译小程序，首次进入应跳转到隐私确认页；
2. 同意后进入首页并看到今日额度 `3 / 3`；
3. 切换“实习 / 校招”和“社会招聘”，重新进入后应保留选择；
4. 历史页连续确认两次清空数据；
5. 清空后应返回隐私确认页，云数据库中不再保留该用户的 P2 记录。

> 2026-09-15：`userCenter` 已成功部署，线上源码与本地 9 个文件哈希一致，云端已安装 `wx-server-sdk 2.4.0`。安全规则仍需在控制台按上述步骤人工确认后才算完成 P2 云端验收。
