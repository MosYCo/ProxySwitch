# 安全问题反馈

目前维护最新发布版本。修复优先在最新版本提供，旧版本请先升级后确认问题。

如果发现配置泄露、命令执行、路径穿越、管理接口越权等问题，请通过本仓库的 **Security → Report a vulnerability** 私密报告。维护者需要先启用 GitHub 的 Private vulnerability reporting；入口不可用时，可以创建仅请求私密联系方式的 Issue，不要在公开内容中提交漏洞细节或凭据。

请说明应用版本、系统、最小复现步骤和影响范围，使用示例配置替代真实地址与密钥。维护者会尽力确认并沟通修复，不承诺固定响应时限。

## 使用边界

- 应用用于开发环境的本地代理管理。Caddy 管理接口应保持在回环地址，不要直接暴露到公网。
- 项目监听地址和端口决定其他设备能否访问代理；请按自己的网络需求配置。
- 配置和备份可能包含自定义 Header。请求日志会按设置脱敏查询参数，但不要将生产密钥写入截图、Issue 或演示配置。
- `tests/fixtures/health-test.p12` 是公开的自动测试身份，其密码也公开。它只能用于本地测试，不能用作生产证书。

## 已知上游依赖限制

2026-10-22 核查：Linux 的 Tauri 2 → GTK / WebKitGTK 依赖链仍使用 `glib 0.18.5`，命中 [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g)（`VariantStrIter` 迭代器的不健全实现）。公告标注的修复版本为 `0.20.0`，无法作为 0.18.x 的补丁直接替换；单独新增新版 GLib 依赖也不会修复旧依赖链。

此问题保留为待处理告警，等待兼容的上游修复或 GTK 依赖链迁移；未将其标为已修复或关闭安全提醒。应用业务代码没有直接调用该迭代器，但这不能证明上游代码不可触达。复查时可运行 `cargo tree --locked --manifest-path src-tauri/Cargo.toml --target x86_64-unknown-linux-gnu -i glib` 核对来源，并在升级后重新验证 Linux 构建与界面运行。

同日 `pnpm audit` 报告 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)：开发工具通过 `fast-glob` / `micromatch` 引入的 `braces 3.0.3` 在解析深层嵌套模式时可能耗尽栈。审计标注修复版本为 `>=3.0.4`，但核查时 npm registry 最新可获取版本仍为 `3.0.3`。此依赖用于开发工具，不随前端生产依赖打包；仍保留告警，待修复版本发布后更新锁文件并重新执行审计。避免让开发工具解析来源不可信的 glob 模式。
