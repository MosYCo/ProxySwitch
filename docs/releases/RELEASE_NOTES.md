# Caddy Proxy Tools 2.1.2

发布日期：2026-10-20

### 开源准备

- 为原创代码和图标加入 MIT 许可证，保留 shadcn/ui 版权声明，并生成 npm、Rust 及 Caddy Go 依赖的第三方许可文本。
- 安装包和发布目录附带主许可证、第三方声明与许可文件，发布产物增加完整许可证压缩包。
- 固定 Node.js、pnpm、Rust 与 Caddy 版本，Caddy 下载同时验证官方归档校验值、固定 SHA-256 和解压后程序哈希；缓存也须校验后才能复用。
- 统一 PowerShell、Shell 和 Node.js 的 Caddy 下载逻辑；校验失败保留原有缓存，并清理临时文件。
- 补充带示例截图的 README、快速上手、示例项目、开发与贡献指南、安全反馈方式和 TLS 测试夹具生成说明。
- 增加当前文件与 Git 历史的公开内容检查、Issue / PR 模板、Windows CI 和按版本标签发布的 GitHub Actions 工作流。
- 发布前核对标签、四处应用版本和中文更新日志；已有发布目录不再被覆盖。
