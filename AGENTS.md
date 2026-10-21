# 打包约定

- 仅在用户明确要求打包时生成安装包。
- 每次发布先同步 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 的版本，并在 `CHANGELOG.md` 补充该版本的中文更新日志，描述实际完成的变更。
- 使用 `pnpm tauri:build` 打包。该流程校验日志、生成版本更新说明，并将新安装包、更新日志和 SHA-256 校验文件整理到 `artifacts/<版本>/`。
- 保留旧版本产物，不终止用户正在运行的应用。打包完成后提供安装包和更新日志的本地链接。

# 文档约定

- README、产品文档、更新日志和包描述聚焦产品用途、功能与使用方式，使用正式名称 Moss ProxySwitch，不加入「由 Moss 开发」「个人标识」等作者介绍。
- 公开版本和更新日志从 0.1.0 开始；`docs/history/` 仅作本地开发归档，不提交，也不在公开文档中引用。
