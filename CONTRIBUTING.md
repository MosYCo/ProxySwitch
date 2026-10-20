# 参与贡献

欢迎报告问题、改进文档和提交代码。参与本项目的原创贡献按仓库根目录的 MIT 许可证提供；引入第三方代码时请保留原始版权与许可证。

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
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

修改请求转发、配置保存或进程管理时，请补充能验证实际行为的测试。Rust 测试使用临时配置和随机本地端口；下载 Caddy 后会运行真实引擎集成测试。TLS 测试夹具的生成方式见 `tests/fixtures/README.md`。

请在 PR 中说明触发条件、修改后的行为和验证结果。界面变更附使用示例项目的截图；不要上传真实后端地址、请求日志、令牌或用户配置。

## 依赖与许可证

更新依赖后运行 `pnpm licenses:generate`，一并提交 `licenses/DEPENDENCIES.txt`。Caddy 升级流程见 `docs/DEVELOPMENT.md`。本项目直接复用了 shadcn/ui 组件，相关 MIT 声明保留在 `licenses/`。

## 版本与发布

普通开发修改写入 `CHANGELOG.md` 的 `[Unreleased]` 部分。发布时将实际变更整理为带日期的版本条目，并同步前端、Tauri、Cargo 与 Cargo 锁文件中的版本。

仅在明确需要安装包时执行 `pnpm tauri:build`。首次公开发布前按 `docs/OPEN_SOURCE.md` 检查目标仓库、许可证和下载产物。
