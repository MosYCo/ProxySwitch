# 开发与可复现构建

## 应用名称与升级兼容

对外名称为 **Moss ProxySwitch**，副标题为「固定入口，随时切换后端环境」；当前支持的代理引擎为 Caddy。窗口、托盘和发布说明使用 `src-tauri/tauri.conf.json` 的 `productName`，侧栏同步该名称。

应用标识 `com.caddy-proxy-tools.desktop`、Rust 包与可执行文件名 `caddy-proxy-tools`、主题存储键及 Windows 自启注册表值保留兼容名称，确保升级后继续读取已有配置并管理原自启项。不要仅为统一品牌替换这些内部标识。GitHub 仓库与前端包名使用 `moss-proxyswitch`。

## 版本约定

公开版本从 `0.1.0` 开始：`0.1.x` 用于修复问题，`0.2.0` 等次版本用于新增功能或较大调整；核心功能和配置兼容策略稳定后再发布 `1.0.0`。

## 分支与开发流程

仓库使用 `develop` 和 `master` 两条长期分支。默认分支为 `develop`，用于汇总下一版本的功能和修复；`master` 用于稳定版本与发布。

| 变更 | 起点与 PR 目标 | 合并方式 |
| --- | --- | --- |
| 功能、修复、文档、依赖维护 | 从 `develop` 创建短期分支 → `develop` | Squash and merge |
| 版本号与更新日志整理 | 从 `develop` 创建发布准备分支 → `develop` | Squash and merge |
| 发布下一版本 | `develop` → `master` | Create a merge commit |
| 已发布版本的紧急修复 | 从 `master` 创建 hotfix 分支 → `master`，再以新 PR 同步修复到 `develop` | Squash and merge |

日常开发先同步 `develop`，再创建 `codex/<目标>` 分支。一个 PR 对应一个完整目标，相关小修改在同一分支继续提交。两条长期分支均要求通过 PR、汇总检查 `Checks passed` 和讨论解决检查；禁止强制推送和删除。`develop` 保持线性历史，`master` 允许发布用的 merge commit。

发布 PR 使用 merge commit，使后续版本仍能从上次发布的开发提交继续比较，避免两个长期分支因 squash 丢失共同历史。发布 PR 打开后固定本次发布范围，新功能保留在各自短期分支，待发布 PR 合并后再进入 `develop`。

Dependabot 每周向 `develop` 提交 npm、Cargo 和 GitHub Actions 更新。同一生态的次版本与补丁更新按组提交，跨主版本升级独立审查；安全修复可随时生成。依赖变更需要重新生成许可证声明并通过完整 CI。

默认分支为 `develop` 时，发布后 GitHub 可能提示 `master had recent pushes` 并显示 `Compare & pull request`。这是近期推送建议；发布 merge commit 会让 `master` 多一条合并记录，文件内容可能完全一致。先查看分支比较中的文件差异，不要为消除提示重写历史或重复创建发布 PR。

依赖 PR 若只因 `Verify dependency notices` 失败，应检出更新分支，安装锁定依赖后执行 `pnpm licenses:generate` 并提交更新的 `licenses/DEPENDENCIES.txt`，再等待完整 CI；不要跳过许可证检查。可将相互关联的安全修复整合为一个维护 PR，验证合入后再关闭被替代的补丁 PR。

`pnpm-workspace.yaml` 对 `minimatch@9.0.3` 的覆盖用于修复 `typescript-estree` 6 固定旧补丁版本引入的 ReDoS，保持 9.x API。上游解除该固定版本后，应复查并移除覆盖。已知暂不能兼容升级的依赖见 [安全说明](../SECURITY.md#已知上游依赖限制)。

## 固定工具链

Node.js 24.18.0、pnpm 11.10.0、Rust 1.96.1 分别由 `.node-version`、`package.json` 和 `rust-toolchain.toml` 固定。请提交 `pnpm-lock.yaml` 和 `src-tauri/Cargo.lock`，不要通过删除锁文件处理构建错误。

Windows 需要 Visual Studio C++ Build Tools 与 WebView2；macOS 需要 Xcode Command Line Tools；Linux 需要 WebKitGTK 4.1、GTK、OpenSSL、AppIndicator 等开发库，详见 [Tauri 环境准备](https://v2.tauri.app/start/prerequisites/)。CI 的 Ubuntu 安装命令见 [公共构建准备](../.github/actions/setup-build/action.yml)。四个目标已完成 v0.1.0 的 CI 构建；各平台的安装和桌面运行体验仍需在对应系统验证。

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

依赖许可清单覆盖锁文件中的所有平台，包括构建与测试依赖，不按当前主机裁剪。四个平台生成同一份 `licenses/DEPENDENCIES.txt`，CI 重新生成后检查与提交文件一致。

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

1. 从 `develop` 创建发布准备分支，例如 `codex/prepare-0.2.1`。将「未发布」中的实际变更整理为带日期的版本条目，同步 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`，经 PR 合入 `develop`。
2. 确认发布范围和验证结果，创建 `develop` → `master` 的发布 PR；完整 CI 通过后使用 **Create a merge commit** 合并。合并 PR 本身不生成安装包。
3. 仅在明确要求发布时同步 `master`，核对版本与更新日志，在合并提交创建并推送 `v<版本>` 标签。Release 工作流检查提交已进入 `master`，再构建与发布安装包。
4. 验证 Release 下载、首次安装、覆盖安装和应用内更新。开始下一轮开发时继续从 `develop` 创建短期分支。

```sh
git fetch github
git switch master
git pull --ff-only github master
# 将版本号替换为本次已完成发布准备的版本。
git tag -a v0.2.1 -m "Moss ProxySwitch 0.2.1"
git push github v0.2.1
```

需要本地安装包时明确执行 `pnpm tauri:build`。默认选择当前主机对应的目标和安装包格式；可用 `--target` 与 `--bundles` 显式指定。构建始终向 Cargo 传入 `--locked`。

发布脚本将安装包、更新日志、主许可证、第三方声明和许可证压缩包整理到 `artifacts/<版本>/<平台>/`，并生成校验文件。同一版本可分别保存多个平台；已有平台目录和旧格式的版本产物不会被覆盖。RPM 的连字符版本命名也会被正确收集，缺少任一指定格式时直接失败。

## CI 与标签发布

应用内更新使用 Tauri 官方 updater 与 GitHub Release 的 `latest.json`。标签发布需要预先配置更新签名 Secrets，本地打包也需要相同私钥；普通 CI 不需要。密钥管理、平台范围和验证步骤见 [应用更新](UPDATING.md)。

CI 和 Release 共用 [构建目标清单](../.github/build-targets.json)，在各平台原生运行，避免误用变化中的 `macos-latest` 架构。

| 平台标识 | GitHub runner | Rust 目标 | 格式 |
| --- | --- | --- | --- |
| windows-x64 | windows-2022 | x86_64-pc-windows-msvc | EXE、MSI |
| linux-x64 | ubuntu-22.04 | x86_64-unknown-linux-gnu | AppImage、DEB、RPM |
| macos-arm64 | macos-15 | aarch64-apple-darwin | DMG |
| macos-x64 | macos-15-intel | x86_64-apple-darwin | DMG |

每个目标检查 runner 架构与 Caddy sidecar 是否匹配，运行前端测试与构建、Rust 格式检查、真实 Caddy 回归测试和许可证一致性检查。Linux 测试通过 Xvfb 运行。独立 UI 检查验证官方组件源码并运行 Chromium 交互回归，组件维护命令见 [界面组件维护](UI.md)。分支保护可要求汇总检查 `Checks passed` 成功。

推送 `v<版本>` 标签后，Release 先复用完整 CI，再构建四个目标。各平台上传独立目录，汇总脚本检查目标与格式是否齐全、逐项校验哈希、核对公共许可文件与更新说明是否一致。公开附件名会将空格转换为点号，并拒绝 GitHub 会再次改写的字符和转换后的同名安装包，再生成覆盖所有附件的 `SHA256SUMS.txt`，保证清单中的名称与实际下载名一致。单个平台失败时不会发布残缺的 Release；已存在的 Release 附件不覆盖。普通提交只运行检查，不生成安装包。

macOS 安装包的系统版本下限为 11.0；当前前端使用 Tailwind CSS 4，实际运行还需要支持现代 CSS 的 WebKit（Safari 16.4 同代及以后），详见 [界面组件维护](UI.md)。当前 CI 使用 ad hoc 签名，不依赖 Apple 开发者凭据，也没有进行 Apple 公证。正式分发的 Developer ID 签名与公证需另行配置；构建成功不能替代各平台安装验证。
