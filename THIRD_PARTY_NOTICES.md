# 第三方软件声明

Moss ProxySwitch 的原创代码与图标采用根目录的 MIT 许可证。第三方软件保留各自的版权和许可证，不因本项目的许可证而改变。

## Caddy

本应用随安装包分发 Caddy 官方程序，固定版本为 **2.11.4**，未修改其源码。macOS 打包时会为嵌入的程序添加构建签名。Caddy 由 Matthew Holt 和 Caddy contributors 开发，采用 Apache License 2.0。

- 上游项目与对应源码：https://github.com/caddyserver/caddy/tree/v2.11.4
- 完整许可证：`licenses/Caddy-LICENSE.txt`
- 二进制内 Go 依赖及其许可证：`licenses/CADDY_DEPENDENCIES.txt`

依赖声明从四个平台的已验证官方二进制读取 Go 构建信息生成；模块源码归档按二进制中的 Go h1 校验值核对。固定版本、官方 SHA-512、归档 SHA-256 与解压后程序 SHA-256 存在 `scripts/caddy-release.json`。

## 界面与桌面运行时

项目使用 React、Radix UI、Tailwind CSS、Lucide 和 Tauri 等开源软件。界面组件部分基于 shadcn/ui，其 MIT 版权声明单独保存在 `licenses/shadcn-ui-LICENSE.txt`。其余生产 npm 依赖和锁文件中所有平台的 Cargo 依赖完整声明、来源及许可文本见 `licenses/DEPENDENCIES.txt`。

部分 Rust 依赖采用 MPL-2.0；对应版本的源码可通过报告中的 crates.io 地址获取，也可以使用 `cargo vendor --locked` 下载。本项目没有修改这些依赖的源码。依赖维护者的版权和源码许可仍然适用。

## 再分发

安装包携带 `LICENSE`、本文件和整个 `licenses/` 目录。发布目录同时提供许可证压缩包。再分发原始安装包时，应一并保留这些文件。

更新 npm / Rust 依赖后运行 `pnpm licenses:generate`；更新 Caddy 时先按 `docs/DEVELOPMENT.md` 校验官方归档并更新 Go 依赖声明，再重新生成报告。
