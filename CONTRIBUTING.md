# 参与贡献

欢迎报告问题、改进文档和提交代码。参与本项目的原创贡献按仓库根目录的 MIT 许可证提供；引入第三方代码时请保留原始版权与许可证。

## 分支与 PR

默认分支 `develop` 用于日常开发，`master` 保存稳定版本。功能、修复和文档调整从最新 `develop` 创建分支，PR 目标为 `develop`；可使用 `codex/<目标>` 命名分支。

```sh
git fetch github
git switch develop
git pull --ff-only github develop
git switch -c codex/your-change
```

一个 PR 对应一个可以独立审查和回滚的完整目标。相关的界面、逻辑、文档和测试可包含多个提交；审查中的小修正继续推送到同一分支。CI 和讨论处理完成后使用 **Squash and merge**。

两条长期分支均要求 PR 和 `Checks passed` 通过。发布时通过 `develop` → `master` 的 PR 汇总变更，使用 **Create a merge commit** 保留共同历史；紧急修复合入 `master` 后需通过 PR 同步回 `develop`。操作与发版步骤见 [开发流程](docs/DEVELOPMENT.md#分支与开发流程)。

## 开发环境

- Windows x64 是当前验证的平台；其他平台的代码尚未经过完整安装验证。
- Node.js 使用 `.node-version` 中的版本，pnpm 使用 `package.json` 中的 `packageManager` 版本。
- 安装 Rustup 后，Rust 会按 `rust-toolchain.toml` 自动选择工具链；另需 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
pnpm install --frozen-lockfile
pnpm download-caddy
pnpm tauri:dev
```

只检查界面可以运行 `pnpm dev`；正式功能需要 Tauri 桌面进程。Caddy 固定版本和官方校验值在 `scripts/caddy-release.json`，不要直接替换二进制绕过校验。

## 提交前检查

```sh
pnpm check:public
pnpm ui:check
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

修改请求转发、配置保存或进程管理时，请补充能验证实际行为的测试。Rust 测试使用临时配置和随机本地端口；下载 Caddy 后会运行真实引擎集成测试。TLS 测试夹具的生成方式见 `tests/fixtures/README.md`。

请在 PR 中说明触发条件、修改后的行为和验证结果。界面变更附使用示例项目的截图；不要上传真实后端地址、请求日志、令牌或用户配置。

修改界面交互时还需运行 `pnpm test:ui`。Dependabot 将维护更新发往 `develop`，按生态合并小版本和补丁更新；跨主版本升级单独审查。

## 依赖与许可证

更新依赖后运行 `pnpm licenses:generate`，一并提交 `licenses/DEPENDENCIES.txt`。Caddy 升级流程见 `docs/DEVELOPMENT.md`。本项目直接复用了 shadcn/ui 组件，相关 MIT 声明保留在 `licenses/`。基础组件不直接修改，新增、升级及交互验证流程见 [界面组件维护](docs/UI.md)。

## 版本与发布

普通产品变更写入 `CHANGELOG.md` 的「未发布」部分，合并 PR 后按需累积发版。发布准备通过 PR 合入 `develop`：将实际变更整理为带日期的版本条目，并同步前端、Tauri、Cargo 与 Cargo 锁文件中的版本。

发布 PR 合入 `master` 且检查通过后，再在该提交创建 `v<版本>` 标签。标签 CI 会检查提交已进入 `master`，防止发布尚未合入稳定分支的开发代码。推送标签会触发三端安装包构建与 Release；普通 PR 和分支推送只运行检查。

仅在明确需要安装包时执行 `pnpm tauri:build`。首次公开发布前按 `docs/OPEN_SOURCE.md` 检查目标仓库、许可证和下载产物。
