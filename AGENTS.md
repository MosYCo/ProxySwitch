# 分支与协作约定

- 默认开发分支为 `develop`，`master` 用于稳定版本与发布。日常功能、修复和文档调整从最新 `develop` 创建 `codex/<目标>` 分支，PR 的目标为 `develop`。
- 一个 PR 对应一个完整目标，相关小修改继续提交到同一分支；独立目标使用独立 PR。功能 PR 在检查通过后使用 squash 合并。
- 发布准备也通过 PR 合入 `develop`：同步四处版本号，将 `CHANGELOG.md` 的「未发布」变更整理为带日期的版本记录。发布范围确定后创建 `develop` → `master` 的发布 PR，使用 merge commit 保留长期分支的共同历史，避免 squash 或 rebase 合并发布 PR。
- 两条长期分支均通过 PR 和 `Checks passed` 检查后合并，不直接推送、强制推送或绕过保护。仅用户明确要求发布或打包时创建版本 tag；tag 必须指向已经进入 `master` 的提交。
- 紧急修复从 `master` 创建 `codex/hotfix-<目标>` 分支，经 PR 合入 `master` 后，再通过面向 `develop` 的 PR 同步修复。完整操作见 `docs/DEVELOPMENT.md`。

# 打包约定

- 仅在用户明确要求打包时生成安装包。
- 每次发布先同步 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 的版本，并在 `CHANGELOG.md` 补充该版本的中文更新日志，描述实际完成的变更。
- 使用 `pnpm tauri:build` 打包。该流程校验日志、生成版本更新说明，并将新安装包、更新日志和 SHA-256 校验文件整理到 `artifacts/<版本>/`。
- 保留旧版本产物，不终止用户正在运行的应用。打包完成后提供安装包和更新日志的本地链接。

# 文档约定

- README、产品文档、更新日志和包描述聚焦产品用途、功能与使用方式，使用正式名称 Moss ProxySwitch，不加入「由 Moss 开发」「个人标识」等作者介绍。
- 公开版本和更新日志从 0.1.0 开始；`docs/history/` 仅作本地开发归档，不提交，也不在公开文档中引用。

# shadcn/ui 约定

- 基础组件使用官方 shadcn/ui Radix Nova 源码，通过官方 CLI 管理，不直接修改 `src/components/ui/`、`src/hooks/use-mobile.ts` 和 `src/lib/utils.ts`。
- 新增组件使用 `pnpm ui:add <组件名>`，查看更新使用 `pnpm ui:diff`，升级使用 `pnpm ui:update`。不手工更新 `shadcn.manifest.json` 掩盖源码差异。
- 业务组合、状态颜色和布局放在业务组件中，品牌主题放在 `src/styles/app.css`。通过官方组件的属性、组合与主题变量定制，不添加自定义基础组件变体。
- 业务页面不直接使用原生 `button`、`input`、`select`、`textarea`、`details`、`summary` 或 `label`，使用对应官方组件。禁用自动填充通过 `src/lib/inputBehavior.ts` 在调用层传入。
- 组件升级后运行 `pnpm ui:check`、`pnpm build`、`pnpm test`、`pnpm test:ui`，依赖变化后重新生成许可证清单。官方组件的 API 变化在业务调用层适配。
