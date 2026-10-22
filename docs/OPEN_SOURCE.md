# 首次公开发布

本地准备包括 MIT 许可证、第三方许可、固定工具链和 Caddy 哈希、示例配置、测试夹具说明、公开内容检查、贡献指南、Issue / PR 模板、三端 CI 和标签发布流程。

首次开源版本为 **v0.1.0**。

## 上传前

- 运行 `pnpm check:public`，审查待提交文件。不要上传 `node_modules`、`target`、`dist`、`artifacts`、真实配置或日志。
- 本仓库保留原有 Git 历史。作者姓名与邮箱属于提交元数据，公开历史时也会公开；如果需要隐藏，应在首次推送前另行处理。仅修改当前 `git user.email` 不会更改历史作者信息。
- 文档截图使用 `docs/preview.html` 的示例数据；真实请求、地址或 Header 不应出现在截图中。

## 创建 GitHub 仓库

创建公开的空仓库，名称建议 `moss-proxyswitch`，不要让 GitHub 自动创建另一份 README 或许可证。本地已有 GitLab 的 `origin`，可保留并新增远程：

```sh
git remote add github https://github.com/YOUR_ACCOUNT/moss-proxyswitch.git
git push -u github master
```

将 `YOUR_ACCOUNT` 替换为实际账号或组织名。推送需要该仓库的写入权限；不要把访问令牌写入 remote URL、脚本或工作流。

## GitHub 设置

1. Settings → Security 启用 Private vulnerability reporting，使 `SECURITY.md` 中的私密入口可用。
2. 设置仓库简介与 Topics，例如 `caddy`、`tauri`、`reverse-proxy`、`developer-tools`。
3. 确认 Actions 的 Checks 工作流在四个原生 runner 上通过。从 `master` 创建 `develop` 并设为默认分支；两条分支均启用保护，要求 PR、汇总检查 `Checks passed` 与讨论解决后合并，禁止强制推送和删除。`develop` 使用线性历史与 squash 合并；`master` 允许发布 PR 使用 merge commit。具体流程见 [开发流程](DEVELOPMENT.md#分支与开发流程)。
4. 如账号支持，启用 secret scanning / push protection。仓库内的模式检查只是一层辅助检查。

## 首次 Release

核对 `0.1.0` 的首次发布日志，确保四处版本一致。发布准备合入 `develop` 后，通过 `develop` → `master` 的发布 PR 保留历史并合入稳定分支。确认该提交的 CI 成功后，切换到同步后的 `master` 再创建标签：

```sh
git fetch github
git switch master
git pull --ff-only github master
git tag -a v0.1.0 -m "Moss ProxySwitch 0.1.0"
git push github v0.1.0
```

工作流会检查标签，构建 Windows EXE / MSI、Linux AppImage / DEB / RPM，以及 Apple Silicon 和 Intel 两种 macOS DMG。所有平台完成并通过哈希与公共文件一致性校验后，再统一发布更新日志、许可证和总 SHA-256 文件。后续发布时，先同步应用版本及更新日志，再推送对应的 `v<版本>` 标签；不复用已有公开版本覆盖旧安装包。发布后检查下载入口和附件，不要把本地旧版本安装包当作这次工作流产物。

带应用内更新的版本还需要预先配置 Tauri 更新签名的两个 Actions Secrets，详见 [应用更新](UPDATING.md)。工作流会上传签名更新包和 `latest.json`，先保留为草稿，所有附件上传并校验完成后再公开。已有旧版用户需手动安装一次带更新功能的版本。

四个目标的配置见 [开发文档](DEVELOPMENT.md)。三端原生检查与首个版本的安装包构建已通过 GitHub Actions；macOS / Linux 仍需实际安装验证。macOS 当前为 ad hoc 签名，尚未接入 Apple Developer ID 签名及公证。
