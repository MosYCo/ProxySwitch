# 分支与协作约定

- 仓库默认分支为 `master`，用于稳定版本与发布；日常开发分支为 `develop`。功能、修复和文档调整从最新 `develop` 创建 `codex/<目标>` 分支，PR 的目标为 `develop`。
- 一个 PR 对应一个完整目标，相关小修改继续提交到同一分支；独立目标使用独立 PR。功能 PR 在检查通过后使用 squash 合并。
- 发布准备也通过 PR 合入 `develop`：同步四处版本号，将 `CHANGELOG.md` 的「未发布」变更整理为带日期的版本记录。发布范围确定后创建 `develop` → `master` 的发布 PR，使用 merge commit 保留长期分支的共同历史，避免 squash 或 rebase 合并发布 PR。
- 两条长期分支均通过 PR 和 `Checks passed` 检查后合并，不直接推送、强制推送或绕过保护。仅用户明确要求发布或打包时创建版本 tag；tag 必须指向已经进入 `master` 的提交。
- 紧急修复从 `master` 创建 `codex/hotfix-<目标>` 分支，经 PR 合入 `master` 后，再通过面向 `develop` 的 PR 同步修复。完整操作见 `docs/DEVELOPMENT.md`。

# 自然语言发布约定

- 用户明确说「发一个版本」「发一个小版本」「发布 X.Y.Z」时，视为授权完成本次发布全流程：从最新远程 `develop` 准备版本、推送短期分支、创建 PR、审查差异、等待并处理 CI、合并准备 PR、创建 `develop` → `master` 发布 PR、审查并合并、创建标签、跟踪 Release CI、核对附件与更新清单。无需就这些已授权步骤逐项询问。用户只讨论发布方案或调整流程时，不创建标签、不生成安装包。
- 未指定版本时默认补丁版本（patch）；指定次版本或主版本时按用户要求处理。先比较最新正式 Release、`master` / `develop` 的版本和已存在的准备 PR，复用已经准备好的版本与 PR，不重复升版。不将无关的本地未提交修改混入发布。
- 使用 `pnpm release:prepare patch`（或指定版本）预览；从最新 `develop` 创建输出的 `codex/prepare-<版本>` 分支后，使用相同参数加 `--write` 写入。先人工核对「未发布」中文更新日志与实际变更，再提交准备 PR。缺失日志时依据真实差异补齐，不编造功能。
- 使用仓库内 `pnpm release:github` 工具创建 PR、检查状态及合并，命令见 `docs/DEVELOPMENT.md`。创建的 PR 均附加到当前任务。合并必须传入本次已审查的完整 head/base SHA；提交或目标分支变化时重新审查。功能与准备 PR 用 squash，发布 PR 用 merge commit。
- 「审批」指实际审查代码、兼容性、更新日志和检查结果；GitHub 禁止作者给自己的 PR 提交正式 Approve，不伪造其他审查者、不放松保护。如果仓库要求其他人的批准，则等待有效批准；存在未解决意见或检查失败时先处理。
- 发布 PR 合并且其 `master` 提交的 CI 成功后，执行 `pnpm release:github tag --version <版本> --sha <发布合并SHA> --pr <发布PR编号>`。该工具使用本地 GitHub 用户凭据创建标签，触发现有 Release 工作流；不要在 Actions 中用 `GITHUB_TOKEN` 创建标签来期待触发下一条工作流。
- 持续跟踪 `pnpm release:github status --version <版本>` 至 Release 完成。核对四个目标的安装包、更新说明、SHA-256 清单、签名和 `latest.json`，确认公开 Release 与预期版本一致，再报告成功。失败时修复或重试原工作流，不移动已发布标签、不覆盖正式附件，不把「已触发」当作「已发布」。
- 默认使用 GitHub CI 生成多平台安装包；用户明确要求本地打包时才额外运行本地 `pnpm tauri:build`。发布结束提供 Release、安装包和更新日志链接，说明版本与验证结果。

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
