# 首次公开发布

本地准备包括 MIT 许可证、第三方许可、固定工具链和 Caddy 哈希、示例配置、测试夹具说明、公开内容检查、贡献指南、Issue / PR 模板、Windows CI 和标签发布流程。

## 上传前

- 运行 `pnpm check:public`，审查待提交文件。不要上传 `node_modules`、`target`、`dist`、`artifacts`、真实配置或日志。
- 本仓库保留原有 Git 历史。作者姓名与邮箱属于提交元数据，公开历史时也会公开；如果需要隐藏，应在首次推送前另行处理。仅修改当前 `git user.email` 不会更改历史作者信息。
- 文档截图使用 `docs/preview.html` 的示例数据；真实请求、地址或 Header 不应出现在截图中。
- 新版许可文件只会包含在之后重新生成的安装包中，旧的 2.1.0 / 2.1.1 安装包没有因此被改写。

## 创建 GitHub 仓库

创建公开的空仓库，名称建议 `caddy-proxy-tools`，不要让 GitHub 自动创建另一份 README 或许可证。本地已有 GitLab 的 `origin`，可保留并新增远程：

```sh
git remote add github https://github.com/YOUR_ACCOUNT/caddy-proxy-tools.git
git push -u github master
```

将 `YOUR_ACCOUNT` 替换为实际账号或组织名。推送需要该仓库的写入权限；不要把访问令牌写入 remote URL、脚本或工作流。

## GitHub 设置

1. Settings → Security 启用 Private vulnerability reporting，使 `SECURITY.md` 中的私密入口可用。
2. 设置仓库简介与 Topics，例如 `caddy`、`tauri`、`reverse-proxy`、`developer-tools`。
3. 确认 Actions 的 Checks 工作流在全新 runner 上通过。默认分支可启用保护规则，要求 PR 与 `windows` 检查通过后合并。
4. 如账号支持，启用 secret scanning / push protection。仓库内的模式检查只是一层辅助检查。

## 首次 Release

准备实际的新版本更新日志，确保四处版本一致。不得复用已经分发过的版本号覆盖旧安装包。确认该提交的 CI 成功后：

```sh
git tag -a vVERSION -m "Caddy Proxy Tools VERSION"
git push github vVERSION
```

将 `VERSION` 替换为当前源码版本。工作流会检查标签并发布 EXE、MSI、更新日志、许可证和 SHA-256 文件。发布后检查下载入口和附件，不要把本地旧版本安装包当作这次工作流产物。

当前自动发布仅覆盖 Windows x64。macOS / Linux 需在相应平台完成 CI 与安装验证后，再增加发布任务和支持声明。
