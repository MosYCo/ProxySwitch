# Caddy Proxy Tools

桌面端反向代理管理工具，基于 Tauri 2 + React + Rust 构建，内置 Caddy 作为代理引擎。

## 开发环境准备

### 前置依赖

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) >= 1.75
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### 安装依赖

```bash
pnpm install
```

### 下载 Caddy Sidecar 二进制

Tauri 需要 Caddy 二进制文件作为 sidecar。运行对应平台的下载脚本：

**Linux / macOS:**
```bash
./scripts/download-caddy.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\download-caddy.ps1
```

下载脚本支持指定版本和平台：
```bash
# 指定版本
./scripts/download-caddy.sh 2.9.1

# 下载所有平台
./scripts/download-caddy.sh "" all
```

```powershell
# 指定版本
.\scripts\download-caddy.ps1 -Version 2.9.1

# 下载所有平台
.\scripts\download-caddy.ps1 -Platform all
```

二进制文件会下载到 `src-tauri/binaries/` 目录。

### 启动开发

```bash
pnpm tauri dev
```

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **后端**: Rust + Tauri 2
- **代理引擎**: Caddy (sidecar)

## 文档

- [产品文档](docs/PRODUCT.md) — 详细的功能规格和 UI 设计
