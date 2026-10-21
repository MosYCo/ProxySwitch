# 应用更新

## 在应用中更新

侧栏的“应用更新”显示当前版本、最近检查时间与新版本的中文更新内容。默认在启动 5 秒后检查一次，之后每 6 小时检查；可关闭自动检查，随时手动检查。检查失败不会阻止代理运行，发现更新时会显示通知和侧栏标记。

点击“下载更新”后可关闭更新窗口，代理继续运行。下载完成并通过签名校验后，点击“安装并重启”并确认，应用才会备份配置、停止自己托管的 Caddy，并执行更新。重启后按“启动与退出”设置决定是否启动 Caddy。安装失败时会尝试恢复更新前正在运行的托管代理，可重试安装。

| 安装方式 | 更新方式 |
| --- | --- |
| Windows EXE / MSI | 应用内下载、校验并启动安装程序，完成后重新打开应用 |
| macOS Apple Silicon / Intel | 应用内下载并替换应用包，再重启 |
| Linux AppImage | 应用内下载、替换 AppImage 并重启；文件及所在目录需可写 |
| Linux DEB / RPM | 检查和提示新版本，通过发布页下载对应安装包后手动安装 |
| 开发模式 / 网页示例 | 不检查、不下载安装更新 |

更新保留本机项目、环境与偏好，安装前自动创建配置备份。首次加入更新功能以前的安装版需要手动安装一次新版本，之后才支持应用内更新。应用只跟随 GitHub 的最新正式 Release，不跟随草稿和预发布版本，也不会自动安装或降级。

macOS 当前使用 ad hoc 签名，尚未配置 Developer ID 和 Apple 公证；应用内更新签名用于验证更新来源，不能代替系统代码签名。各平台实际安装、权限与重启过程仍需在对应系统进行发布验证。

## 发布端配置

采用 Tauri 官方 updater 插件，固定读取：

```text
https://github.com/MosYCo/ProxySwitch/releases/latest/download/latest.json
```

`src-tauri/tauri.conf.json` 保存更新公钥，`bundle.createUpdaterArtifacts` 启用更新产物。私钥只用于签名，不可提交到源码或发布附件。发布仓库需配置两个 Actions Secrets：

- `TAURI_SIGNING_PRIVATE_KEY`：Tauri 签名私钥的完整内容。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：对应的私钥密码。

首次配置可用 `pnpm tauri signer generate -w <安全目录>/proxyswitch.key` 生成密钥，将 `.pub` 文件中的完整公钥字符串写入 Tauri 配置，再将私钥及密码保存到仓库 Secrets。已配置的项目应复用同一密钥；丢失或随意替换私钥会导致已安装应用无法验证后续更新。请将私钥与密码分别备份到安全位置，保留公钥。

本地打包时在当前 PowerShell 会话设置密钥，不要写入源码或命令日志：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw '<安全目录>\proxyswitch.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content -Raw '<安全目录>\password.txt'
pnpm tauri:build
```

发布前仍需同步四处版本号和中文更新日志。推送版本标签后，Release workflow 构建四个原生目标，除普通安装包外收集：

- Windows EXE、MSI 及各自 `.sig`。
- Linux AppImage 及 `.sig`。
- 两种 macOS 架构各自带版本号和架构的 `.app.tar.gz` 及 `.sig`。
- 合并所有平台后的 `latest.json`，以及包含上述附件的 `SHA256SUMS.txt`。

本地每个平台目录也生成只包含当前平台的 `latest.json`，完整 Release 使用合并后的清单。本地只选择 DEB / RPM 时不生成 AppImage 更新条目。发布汇总会验证各文件哈希、更新包的 minisign 文件签名与可信注释、公钥匹配、平台齐全、更新说明一致及下载 URL 对应实际附件名；缺少密钥、签名或任意平台会阻止发布。先上传为草稿，全部附件上传完成并校验名称、大小及 GitHub 返回的摘要后才公开 Release，检查失败则保留草稿。已有版本产物不覆盖。

普通 CI 只运行检查与回归，不需要私钥，也不生成安装包。测试通过本地签名样本和模拟更新流程验证校验、重试与安装确认，不会安装更新或关闭正在运行的应用。端到端升级需要在隔离环境中，使用同一公钥的两个正式版本完成；确认配置保留、托管进程退出和新版本重新启动。

Fork 仓库发布前需生成自己的密钥，并同步更新配置中的 endpoint、`scripts/updater-artifacts.mjs` 的下载地址，以及 `src-tauri/src/updater.rs` 的发布页与下载地址校验。
