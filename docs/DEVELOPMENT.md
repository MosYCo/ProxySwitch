# 开发与可复现构建

## 固定工具链

Node.js 24.18.0、pnpm 11.10.0、Rust 1.96.1 分别由 `.node-version`、`package.json` 和 `rust-toolchain.toml` 固定。请提交 `pnpm-lock.yaml` 和 `src-tauri/Cargo.lock`，不要通过删除锁文件处理构建错误。

Windows 需要 Visual Studio C++ Build Tools 与 WebView2，详见 [Tauri 环境准备](https://v2.tauri.app/start/prerequisites/)。当前 CI 和安装验证覆盖 Windows x64。其他平台可以尝试源码构建，但暂不承诺安装包可用性。

```sh
pnpm install --frozen-lockfile
pnpm download-caddy
pnpm tauri:dev
```

`pnpm tauri:dev` 会检查固定 Caddy 二进制，然后启动前端和桌面应用。`pnpm dev` 只启动前端；`docs/preview.html` 提供完全使用示例数据的界面预览，适合生成文档截图。

## 验证

```sh
pnpm check:public
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
pnpm licenses:generate
```

Rust 测试在临时目录和随机回环端口运行，使用当前平台的真实 Caddy sidecar。TLS 测试的公开身份见 `tests/fixtures/README.md`。

公开内容检查会读取当前待提交文件与所有可达的 Git 历史对象，报告常见密钥格式、私人证书和个人绝对路径。报告不输出匹配到的密钥值。这是模式检查，不能替代对示例配置、截图和提交历史的人工审查。

## Caddy 升级

固定版本、官方归档 SHA-512、归档 SHA-256、解压后二进制 SHA-256 都在 `scripts/caddy-release.json`。现有缓存必须匹配二进制哈希，下载必须同时匹配归档哈希，才会原子替换目标文件。没有访问 GitHub 的需要时，已验证缓存可以离线使用。

升级时需：

1. 从 Caddy 官方 Release 下载四个平台的归档及官方校验清单，核对官方 SHA-512 后，计算归档和解压后程序的 SHA-256。
2. 更新 `scripts/caddy-release.json`。不可仅修改版本号或信任未校验的旧缓存。
3. 运行 `node scripts/caddy-licenses.mjs`，生成对应二进制内所有 Go 模块的声明；该命令需要网络，下载的源码按二进制中的 Go h1 校验值验证。
4. 从同一版本官方源码更新 `licenses/Caddy-LICENSE.txt`，同步第三方声明中的版本，再运行 `pnpm licenses:generate` 和全部测试。

`download-caddy.ps1` 和 `download-caddy.sh` 都调用同一份 Node.js 实现，参数保持 `[固定版本] [平台]`；支持 `windows`、`linux`、`macos-arm`、`macos-intel` 和 `all`。非当前固定版本会被拒绝。

## 图标

修改 `src-tauri/icons/app-icon.svg` 后运行 `pnpm icons:generate`。侧栏和网页图标直接引用此 SVG，Windows ICO、macOS ICNS 和 PNG 从同一源图生成。macOS 托盘使用独立的单色模板。

## 发布

先将实际变更整理成带日期的版本条目，同步四处应用版本，再运行 `pnpm tauri:build`。发布脚本将安装包、更新日志、主许可证、第三方声明和许可证压缩包整理到 `artifacts/<版本>/`，并生成校验文件。旧版本目录保留。

GitHub 上推送 `v<版本>` 标签后，Release 工作流会先复用完整 CI，再构建 Windows 安装包。只有标签与代码版本一致、更新日志完整、所有检查通过时才发布附件。普通提交不会生成安装包。
