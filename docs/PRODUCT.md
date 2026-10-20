# Caddy Proxy Tools - 产品文档

## 1. 产品概述

**Caddy Proxy Tools** 是一个桌面端反向代理管理工具，基于 Tauri 2 + React + Rust 构建，内置 Caddy 作为代理引擎。

### 1.1 核心价值
- **开箱即用**: 内置 Caddy 二进制，用户无需单独安装
- **可视化管理**: 图形界面管理多项目、多环境的代理配置
- **一键切换**: 在不同后端环境（开发/测试/预发布/生产）之间快速切换
- **实时监控**: 健康检查、延迟监控、日志查看

### 1.2 目标用户
- 前端开发团队：需要在多个后端环境之间切换
- 运维人员：需要管理多个反向代理路由
- DevOps：需要可视化代理状态和健康监控

---

## 2. 技术栈

### 2.1 桌面框架
| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.x | 桌面应用框架，窗口管理、系统托盘、IPC |
| Rust | 1.75+ | 后端逻辑、进程管理、配置存储 |

### 2.2 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| Tailwind CSS | 3.x | 原子化 CSS |
| shadcn/ui | latest | UI 组件库 (Radix UI + Tailwind) |
| Lucide React | latest | 图标库 |
| React Router | 6.x | 路由（当前单页） |

### 2.3 Rust 依赖
| Crate | 用途 |
|-------|------|
| `tauri` | 应用框架 |
| `tauri-plugin-shell` | Sidecar 进程管理（Caddy） |
| `serde` / `serde_json` | JSON 序列化 |
| `tokio` | 异步运行时 |
| `reqwest` | HTTP 客户端（Caddy Admin API） |
| `chrono` | 时间处理 |
| `tracing` / `tracing-appender` | 日志系统 |

### 2.4 Sidecar
| 组件 | 用途 |
|------|------|
| Caddy | 反向代理引擎，作为 sidecar 二进制打包 |

---

## 3. UI 设计规范

### 3.1 设计主题
**"Control Tower - Deep Space"** — 深空控制台风格

设计理念：模拟航天控制中心的深色界面，使用翡翠绿作为主色调，营造终端/技术感。

### 3.2 色彩系统

```css
/* 背景色 */
--background: hsl(220, 30%, 5%)      /* 极深蓝黑 #080b12 */
--card: hsl(220, 25%, 8%)            /* 深色卡片 #0e1219 */
--muted: hsl(220, 20%, 12%)          /* 暗灰 #181d27 */

/* 前景色 */
--foreground: hsl(210, 20%, 90%)     /* 浅灰 #dde1e8 */
--card-foreground: hsl(210, 20%, 90%)
--muted-foreground: hsl(215, 15%, 50%) /* 中灰 #6b7a8d */

/* 主色 - 翡翠绿 (终端感) */
--primary: hsl(160, 84%, 45%)        /* #12b886 */
--primary-foreground: hsl(220, 30%, 5%)

/* 强调色 - 青色 */
--accent: hsl(190, 90%, 50%)         /* #0cb7eb */
--accent-foreground: hsl(220, 30%, 5%)

/* 状态色 */
--success: hsl(160, 84%, 45%)        /* 翡翠绿 */
--warning: hsl(38, 90%, 55%)         /* 琥珀色 #e8a317 */
--destructive: hsl(0, 75%, 55%)      /* 红色 #d94040 */
--info: hsl(190, 90%, 50%)           /* 青色 */

/* 边框 */
--border: hsl(220, 20%, 15%)         /* #1e2530 */
--input: hsl(220, 20%, 12%)          /* #181d27 */
--ring: hsl(160, 84%, 45%)           /* 焦点环 */
```

### 3.3 字体

| 用途 | 字体族 | 备选 |
|------|--------|------|
| 正文 | Inter | system-ui, sans-serif |
| 标题 | Space Grotesk | sans-serif |
| 代码/数据 | JetBrains Mono | Fira Code, monospace |

### 3.4 间距与尺寸

| 元素 | 尺寸 |
|------|------|
| Header 高度 | 48px (h-12) |
| 卡片圆角 | 6px (0.375rem) |
| 卡片间距 | 12px (gap-3) |
| 容器内边距 | 16px (px-4 py-4) |
| 按钮高度 sm | 28px (h-7) |
| 按钮高度 default | 32px (h-8) |
| 图标尺寸 sm | 12-14px |
| 图标尺寸 default | 14-16px |

### 3.5 UI 特征效果

**网格线背景** (`.bg-grid`)
```css
background-image:
  linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
background-size: 40px 40px;
```

**几何卡片** (`.card-geo`)
- 相对定位 + overflow hidden
- 左上角 8px 绿色装饰线 (`::before`)

**状态指示灯** (`.status-dot`)
- 2px 圆点 + `animate-ping` 呼吸动画
- healthy: 翡翠绿, unhealthy: 红色

**绿色辉光** (`.glow-green`)
```css
box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
```

**终端输入框** (`.input-terminal`)
- 深色背景 + 等宽字体
- 焦点时绿色边框 + 绿色环

### 3.6 组件规范

#### Card
- 背景: `bg-card` (hsl(220, 25%, 8%))
- 边框: `border-border/50` (半透明)
- Hover: 边框变亮 `hover:border-border/80`
- 激活态: `border-primary/50` + `glow-green`

#### Badge 变体
| 变体 | 用途 | 样式 |
|------|------|------|
| success | 健康状态 | 绿色背景 |
| destructive | 错误/异常 | 红色背景 |
| info | 信息/当前 | 青色背景 |
| warning | 警告/HTTPS | 琥珀色背景 |
| ghost | 次要信息 | 透明背景 |
| outline | 标签/分类 | 边框样式 |

#### Button 变体
| 变体 | 用途 |
|------|------|
| default | 主操作（创建/保存） |
| outline | 次要操作（切换/重启） |
| ghost | 图标按钮/工具栏 |
| destructive | 危险操作（删除） |

#### Dialog
- 最大宽度: 425px
- 背景: `bg-card`
- 表单: Label + Input + 帮助文本
- Footer: 取消 + 确认, 危险操作左对齐

#### Select
- 下拉背景: `bg-card`
- 焦点项: `focus:bg-primary/10 focus:text-primary`

#### Toast
- 位置: 右下角
- 变体: success / destructive
- 自动消失

---

## 4. 页面结构

### 4.1 Dashboard（唯一页面）

```
┌─────────────────────────────────────────────────────────┐
│ Header                                                   │
│ [Logo] 代理管理器        [WS状态] [Caddy状态] [启停] [刷新] │
├─────────────────────────────────────────────────────────┤
│ StatsBar                                                 │
│ [项目数: 3] [环境数: 8] [健康: 6/8] [端口: :20000]       │
├─────────────────────────────────────────────────────────┤
│ ProjectToolbar                                           │
│ [项目选择器 ▼] [+]              [编辑项目] [重启代理]      │
│ 项目描述 :20000                            [+ 添加环境]   │
├─────────────────────────────────────────────────────────┤
│ EnvironmentCard Grid (2-3 列)                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ │ UAT      │ │ 测试3    │ │ 生产     │                 │
│ │ ● 当前   │ │          │ │          │                 │
│ │ HTTPS:// │ │ HTTP://  │ │ HTTPS:// │                 │
│ │ 健康 45ms│ │ 异常     │ │ 健康 12ms│                 │
│ │ [编辑][删]│ │ [切换]  │ │ [切换]   │                 │
│ └──────────┘ └──────────┘ └──────────┘                 │
├─────────────────────────────────────────────────────────┤
│ LogViewer                                                │
│ [Terminal icon] 系统日志 [100]    [级别▼] [分类▼] [清空] │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 14:32:01 INFO 代理 后端健康: 项目A/UAT (延迟: 45ms)  │ │
│ │ 14:32:05 WARN 健康 后端异常: 项目A/测试3 - timeout   │ │
│ │ 14:32:10 INFO 系统 环境已切换: 项目A → UAT           │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 4.2 组件层级

```
Dashboard
├── Header
│   ├── Logo (ArrowLeftRight icon + "代理管理器" + "CADDY 控制中心")
│   ├── ConnectionBadge (WebSocket 连接状态)
│   ├── CaddyStatus (运行状态指示灯 + 启动/停止/重启)
│   └── RefreshButton
├── StatsBar
│   ├── StatCard (项目数, Box icon, primary)
│   ├── StatCard (环境数, Layers icon, cyan)
│   ├── StatCard (健康数, Activity icon, emerald)
│   └── StatCard (端口, Wifi icon, amber)
├── ProjectToolbar
│   ├── ProjectSelector (Select + Add button)
│   ├── EditProjectButton
│   └── RestartProxyButton
├── EnvironmentCard[] (grid)
│   ├── StatusIndicator (active: green ping, inactive: gray/red dot)
│   ├── Name + Description
│   ├── HealthBadge + ActiveBadge
│   ├── ProtocolBadge + Address + Latency
│   └── SwitchButton + EditButton + DeleteButton
├── EmptyState (无项目时)
├── LogViewer
│   ├── LevelFilter (Select)
│   ├── CategoryFilter (Select)
│   ├── RefreshButton + ClearButton
│   └── LogList (terminal style, auto-scroll)
├── ProjectDialog (创建/编辑/删除项目)
└── EnvironmentDialog (创建/编辑/删除环境)
```

---

### 4.3 统一设置

侧栏「设置」打开按分类组织的设置面板，包含启动与退出、请求与日志、健康检查、代理默认值、Caddy 引擎、数据与备份。保存前在分类之间切换保留草稿，关闭时提示未保存的修改；最小窗口下内容滚动，保存按钮保持可见。

配置存储新增 `settings`，旧配置自动补齐默认值。代理参数按全局、项目、环境依次覆盖；健康检查的路径、超时、状态码和回退选项也可按项目及环境覆盖。全局健康检查开关作为总开关，未启用检查的环境不会持续显示待检测。

请求日志支持采集开关、100–10000 条每来源缓存、慢请求阈值、忽略路径、查询参数脱敏及磁盘保留期限。脱敏发生在请求摘要生成、事件发送及磁盘写入之前；保留天数默认 0，不自动清理既有日志。引擎日志级别与访问日志独立配置。

数据操作支持导入预览、同名项目合并覆盖或全部替换，以及单项目/全部项目导出到下载目录。修改前默认自动备份，备份数量可配置；恢复可选择仅项目，或连同应用设置恢复。运行时配置变更仍经过 Caddy 确认和失败回滚，停止引擎时可离线保存。

Windows 登录自启仅在用户保存该选项后修改当前用户的启动项。窗口关闭行为可选择托盘或退出，启动时可隐藏窗口。Caddy 自动恢复默认关闭，开启后仅重启意外退出的托管子进程，手动停止不恢复；达到重试上限后停止，稳定运行一分钟后重置计数。

## 5. 后端功能清单

### 5.1 数据模型

```rust
// 根配置
struct Config {
    caddy_admin: String,      // 默认 "localhost:2019"
    projects: HashMap<String, Project>,
}

// 项目
struct Project {
    name: String,              // 唯一标识
    listen: String,            // 监听端口, 格式 ":port"
    enabled: bool,             // 是否启用，旧配置默认 true；停用后不生成路由或执行健康检查
    desc: String,              // 描述
    environments: HashMap<String, Environment>,
    current: String,           // 当前活跃环境名
}

// 环境
struct Environment {
    addr: String,              // 后端地址, "http(s)://host:port"
    desc: String,              // 描述
}

// 健康状态
struct HealthStatus {
    healthy: bool,
    last_check: DateTime<Utc>,
    error: Option<String>,
    latency_ms: i64,
}

// 日志条目
struct LogEntry {
    timestamp: DateTime<Utc>,
    level: LogLevel,           // DEBUG | INFO | WARN | ERROR
    category: String,          // system | proxy | health | caddy
    message: String,
}
```

### 5.2 配置存储 (Store)

**职责**: JSON 文件持久化, 线程安全读写

| 方法 | 说明 |
|------|------|
| `new(path)` | 加载或创建配置文件 |
| `get_config()` | 获取完整配置（克隆） |
| `get_project(name)` | 获取单个项目 |
| `set_project(project)` | 创建/更新项目, 自动保存 |
| `delete_project(name)` | 删除项目 |
| `get_environment(project, env)` | 获取单个环境 |
| `set_environment(project, env, data)` | 创建/更新环境, 首个环境自动设为 current |
| `delete_environment(project, env)` | 删除环境, 不允许删除 current |
| `set_current_environment(project, env)` | 切换当前环境 |
| `build_with_current(project, env)` | 构建预览配置（不保存） |

**存储规则**:
- 原子写入: 写入临时文件 → rename 替换
- 读写锁: `tokio::sync::RwLock`
- 配置路径: `~/.config/caddy-proxy-tools/config.json` (Tauri app data dir)

### 5.3 Caddy 管理

#### 5.3.1 进程管理 (Manager)

| 方法 | 说明 |
|------|------|
| `start()` | 启动 Caddy sidecar 进程 |
| `stop()` | 优雅停止 (caddy stop), 失败则 kill |
| `restart()` | stop → 等待 500ms → start |
| `is_running()` | 进程是否运行中 |
| `pid()` | 进程 PID |
| `uptime()` | 运行时长 |

**Sidecar 查找顺序**:
1. Tauri sidecar (`src-tauri/binaries/caddy-{target}`)
2. 系统 PATH 中的 `caddy`

#### 5.3.2 Admin API 客户端 (Client)

| 方法 | 说明 |
|------|------|
| `load_config(config)` | POST /load 加载完整配置 |
| `get_config()` | GET /config/ 获取当前配置 |
| `health_check()` | 检查 Admin API 是否可达 |

**超时**: 10 秒

#### 5.3.3 配置生成 (Generator)

**输入**: `Config` 结构体
**输出**: Caddy JSON 配置

**生成规则**:
1. 按 `listen` 端口分组已启用且有当前环境的项目，停用或空项目不打开端口。独占端口上的最后一个项目停用后释放端口；共用端口上的其他项目继续运行。
2. 每个端口生成一个 server；共用端口前，所有项目必须显式启用 `path_prefix`
3. 每个项目生成一个 route:
   - match: 仅在 `path_prefix=true` 时匹配 `/{project_name}` 和 `/{project_name}/*`，不限制 Host
   - `strip_prefix=true` 时先移除项目路径前缀；旧配置迁移保留原转发方式
   - 后端 URL 的路径作为基础路径加在请求路径前，保留请求查询参数
   - handler: `reverse_proxy`
   - upstream: `{addr}`
   - headers: 设置 `X-Forwarded-Prefix` 和 `Host`
4. HTTPS 后端自动添加 TLS transport 配置
5. 路径模式由项目配置决定，项目数量变化不会改变已有路由
6. 按 listen 和 project name 排序，保证配置稳定

**示例输出**:
```json
{
  "admin": { "listen": "localhost:2019" },
  "apps": {
    "http": {
      "servers": {
        "proxy_0": {
          "listen": [":20000"],
          "routes": [
            {
              "match": [{ "path": ["/公有云", "/公有云/*"] }],
              "handle": [{
                "handler": "reverse_proxy",
                "upstreams": [{ "dial": "test3-kf.7moor.com:443" }],
                "headers": {
                  "request": {
                    "set": {
                      "X-Forwarded-Prefix": ["/公有云"],
                      "Host": ["test3-kf.7moor.com"]
                    }
                  }
                },
                "transport": { "protocol": "http", "tls": {} }
              }],
              "terminal": true
            }
          ]
        }
      }
    }
  }
}
```

### 5.4 健康检查 (Health Checker)

**职责**: 按配置范围定时 HTTP 检查启用项目的后端环境

| 方法 | 说明 |
|------|------|
| `start()` | 启动定时检查 (tokio::spawn) |
| `stop()` | 停止检查 |
| `get_status()` | 获取所有环境健康状态 |
| `get_project_status(name)` | 获取项目健康状态 |
| `get_env_status(project, env)` | 获取环境健康状态 |
| `force_check()` | 强制立即检查所有 |
| `force_check_project(name)` | 强制检查单个项目 |

**检查逻辑**:
1. 请求 `{base_url}{health.path}`，路径按全局、项目、环境继承，默认 `/health`
2. 允许回退时，网络失败或返回 404/405 时尝试 `{base_url}/`；显式接受的状态码不触发回退
3. 未指定预期状态码时接受 200–399；指定后只接受列出的状态码，不跟随重定向
4. 记录包括回退请求在内的总延迟 (ms)，HTTPS 遵循环境的证书校验设置
5. 每轮完成发送 `health-updated` 更新检查时间和延迟，健康状态变化时另发 `health-changed`

**默认间隔**: 30 秒，可在设置中调整；修改配置后唤醒检查器，避免重复并发检查

### 5.5 日志系统 (Logger)

**职责**: 文件日志 + 内存日志 + 事件广播

| 方法 | 说明 |
|------|------|
| `log(level, category, message)` | 写入日志 |
| `get_recent(limit)` | 获取最近 N 条 |
| `get_by_level(level)` | 按级别筛选 |
| `get_by_category(category)` | 按分类筛选 |
| `clear(source?)` | 按来源清空会话缓存并返回清空游标，保留磁盘日志 |

**分类**: `system` | `proxy` | `health` | `caddy`

**持久化**: 写入 `logs/` 目录下的日志文件

日志页的状态概览持续展示引擎、代理项目和后端连接情况；默认展示「请求记录」，并可切换「软件事件」「Caddy 运行日志」。请求记录展示项目、环境、后端、方法、原始 URI、响应码、耗时和来源，支持项目与异常筛选。Caddy 路由通过 `log_append` 写入请求发生时的项目、环境及后端快照，在重写路径之前记录原始 URI；配置文本经 URL 编码避免被 Caddy 当作请求占位符展开。历史记录按快照展示，不根据当前项目配置猜测归属。

软件事件、Caddy 两个来源默认各保留最近 500 条，可在设置中调整到 100–10000 条；Caddy 来源包含访问请求和引擎日志。日志有单调递增 ID，实时推送与快照合并时按 ID 去重，清空游标阻止旧快照重新带回记录。默认收起成功的管理接口轮询及调试记录，保留所有警告、错误与失败请求；连续相同事件可合并计数，访问请求逐条展示。Caddy JSON 原始结构经过查询参数脱敏后保留在详情和磁盘文件中，调整脱敏规则会使既有 Caddy 会话缓存失效。

导航分为「项目总览」「项目配置」和「运行日志」：总览列出所有项目的状态卡片；项目入口只展示该项目的启停和环境配置；项目中的「查看请求」进入全局日志并预设项目筛选，不嵌入日志面板。

### 5.6 输入验证 (Validation)

| 字段 | 规则 |
|------|------|
| 项目名 | 不能为空, 不能含 `/ ? #` 和空白字符 |
| 环境名 | 同项目名 |
| 监听端口 | 格式 `:port`, 端口 1-65535 |
| 后端地址 | `http(s)://host:port` 或 `host:port`, 端口 1-65535 |
| 当前环境 | 必须存在于项目的 environments 中 |
| 删除环境 | 不能删除当前活跃环境 |

### 5.7 Tauri Commands (IPC 接口)

替代 HTTP REST API, 前端通过 `invoke()` 调用。

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `list_projects` | - | `Vec<Project>` | 列出所有项目 |
| `get_project` | `name` | `Project` | 获取项目 |
| `create_project` | `project` | `Project` | 创建项目 |
| `update_project` | `name, project` | `Project` | 更新项目 |
| `delete_project` | `name` | `()` | 删除项目 |
| `list_environments` | `project_name` | `Vec<(String, Environment)>` | 列出环境 |
| `create_environment` | `project, name, env` | `()` | 创建环境 |
| `update_environment` | `project, name, env` | `()` | 更新环境 |
| `delete_environment` | `project, name` | `()` | 删除环境 |
| `switch_environment` | `project, env` | `()` | 切换环境 |
| `restart_proxy` | - | `()` | 重启代理 |
| `get_proxy_status` | - | `Vec<ProxyStatus>` | 代理状态 |
| `get_health_status` | - | `HashMap` | 健康状态 |
| `force_health_check` | - | `()` | 强制检查 |
| `get_logs` | `limit?` | `Vec<LogEntry>` | 获取日志 |
| `get_logs_by_level` | `level` | `Vec<LogEntry>` | 按级别筛选 |
| `get_logs_by_category` | `category` | `Vec<LogEntry>` | 按分类筛选 |
| `clear_logs` | `source?: runtime / caddy` | `LogClearResult` | 清空指定来源的会话缓存 |
| `get_caddy_status` | - | `CaddyStatus` | Caddy 状态 |
| `start_caddy` | - | `()` | 启动 Caddy |
| `stop_caddy` | - | `()` | 停止 Caddy |
| `restart_caddy` | - | `()` | 重启 Caddy |

### 5.8 Tauri Events (事件推送)

替代 WebSocket, 后端通过 `app.emit()` 推送事件。

| 事件名 | 数据 | 触发时机 |
|--------|------|---------|
| `environment-switched` | `{ project, environment }` | 环境切换成功 |
| `proxy-restarted` | `{}` | 代理重启成功 |
| `config-changed` | `()` | 项目或环境配置变化 |
| `health-updated` | `HashMap` | 健康检查完成 |
| `health-changed` | `{ project, environment, status }` | 健康状态变化 |
| `log-created` | `LogEntry` | 新日志产生 |
| `logs-cleared` | `{ source, through_id }` | 日志缓存清空 |
| `caddy-status-changed` | `()` | Caddy 启停或进程退出 |

---

## 6. 系统托盘

### 6.1 托盘菜单

```
┌──────────────────────────┐
│ Caddy Proxy Tools        │
├──────────────────────────┤
│ ▶ 显示主窗口             │
├──────────────────────────┤
│ Caddy: ● 运行中          │
│   ├ 启动                 │
│   ├ 停止                 │
│   └ 重启                 │
├──────────────────────────┤
│ 项目: 公有云              │
│   ├ UAT (当前)           │
│   ├ 测试3                │
│   └ 生产                 │
├──────────────────────────┤
│ 退出                     │
└──────────────────────────┘
```

### 6.2 窗口行为
- 关闭窗口 → 默认隐藏到托盘，可在设置中改为退出
- 双击托盘图标 → 显示窗口
- 退出菜单 → 优雅关闭 Caddy + 退出

---

## 7. 打包与分发

### 7.1 Sidecar 二进制

Caddy 发布的是压缩包（Linux/macOS 为 `.tar.gz`，Windows 为 `.zip`），需要解压后重命名。

下载地址格式：`https://github.com/caddyserver/caddy/releases/download/v{VERSION}/caddy_{VERSION}_{os}_{arch}.{ext}`

| 平台 | 压缩包名 | 解压后重命名 |
|------|---------|-------------|
| Linux x86_64 | `caddy_{VER}_linux_amd64.tar.gz` | `caddy-x86_64-unknown-linux-gnu` |
| Windows x86_64 | `caddy_{VER}_windows_amd64.zip` | `caddy-x86_64-pc-windows-msvc.exe` |
| macOS x86_64 | `caddy_{VER}_mac_amd64.tar.gz` | `caddy-x86_64-apple-darwin` |
| macOS ARM64 | `caddy_{VER}_mac_arm64.tar.gz` | `caddy-aarch64-apple-darwin` |

下载脚本：
- Linux/macOS: `scripts/download-caddy.sh`
- Windows (PowerShell): `scripts/download-caddy.ps1`

### 7.2 安装包体积估算

| 组件 | 大小 |
|------|------|
| Tauri 框架 + Rust 后端 | ~5 MB |
| React 前端 (gzipped) | ~2 MB |
| Caddy 二进制 | ~40 MB |
| **总计** | **~47 MB** |

### 7.3 配置文件位置

| 平台 | 路径 |
|------|------|
| Linux | `~/.config/caddy-proxy-tools/config.json` |
| macOS | `~/Library/Application Support/caddy-proxy-tools/config.json` |
| Windows | `%APPDATA%\caddy-proxy-tools\config.json` |

---

## 8. 与现有版本的差异

| 维度 | 现有版本 (Go) | Tauri 版本 |
|------|--------------|-----------|
| 后端语言 | Go | Rust |
| 运行方式 | 独立服务器 | 桌面应用 |
| Caddy | 需系统安装 | 内置 sidecar |
| API | HTTP REST + WebSocket | Tauri IPC + Events |
| 前端 | 嵌入式 SPA | Tauri WebView |
| 配置存储 | 当前目录 config.json | 系统 AppData 目录 |
| 部署 | Docker / 手动 | 安装包 |
| 多实例 | 支持（多服务器） | 单机（可连接远程） |
