# 界面组件维护

界面基础组件采用官方 shadcn/ui **Radix Nova** 系列，由仓库内固定版本的官方 CLI 生成。`src/components/ui/`、`src/hooks/use-mobile.ts` 和 `src/lib/utils.ts` 保持生成后的源码，不加入项目专有逻辑、样式变体或默认属性。

`shadcn.manifest.json` 记录 CLI 版本、样式、官方注册表地址和生成文件的 SHA-256。校验时只统一 Windows / Unix 换行符；其余源码差异、额外组件文件和业务页面直接使用原生交互控件都会使检查失败。

## 新增和升级

```sh
# 先查看官方更新的差异
pnpm ui:diff

# 升级现有官方组件并更新来源清单
pnpm ui:update

# 安装新的官方组件，例如 Accordion
pnpm ui:add accordion

# 校验组件来源与业务调用约定
pnpm ui:check
```

需要升级 CLI 时，先运行 `pnpm update shadcn --latest --save-exact`，再运行 `pnpm ui:diff` 和 `pnpm ui:update`。组件由 shadcn 官方注册表更新；npm 安装或更新运行时依赖不会自动替换项目中的组件源码。

更新后检查 Git 差异，并运行：

```sh
pnpm licenses:generate
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:ui
```

官方更新可能改变组件属性或交互。兼容性调整放在业务调用层，保留官方组件源码，避免下次覆盖升级产生本地补丁冲突。

新增前必须通过现有源码校验；升级会覆盖清单内的组件，但会拒绝目录中的额外文件或已定制的辅助文件，防止把本地修改重新登记成官方来源。先将业务逻辑移出受管理目录，并从 Git 恢复辅助文件，再执行升级。

## 业务代码与主题

- 页面直接导入官方 Button、Card、Field、Sidebar、Tabs、ToggleGroup、Collapsible、InputGroup 等组件。
- 业务组合放在 `src/components/` 和 `src/components/settings/`。例如 `DetailsSection` 用官方 Collapsible 和 Button 组合详情区，数字设置用官方 ButtonGroup、Input 与加减按钮组合；这些文件可以按产品需要修改。
- `IconPicker` 用官方 Popover、Tabs 和 Button 组合内置图标与 Emoji 选择；`EntityIcon` 统一渲染项目和环境的图标，未知标识回退到自动图标。导航展开偏好在业务页面持久化，通过受控属性传入官方 SidebarProvider。
- 品牌色和页面布局放在 `src/styles/app.css`，Tailwind 主题映射放在 `src/index.css`。不通过修改官方组件来增加 `success`、`warning` 等自定义变体，业务状态使用官方属性和调用处的 `className`。
- 表单通过 `src/lib/inputBehavior.ts` 传入自动填充、拼写检查等偏好；保留 Tauri 的自动填充禁用设置。
- 详情区和设置页通过官方 `forceMount` 属性保留编辑状态，收起、切换分类时不丢失尚未保存的值。
- 应用保留现有主题存储键，官方 Sonner 通过 `theme` 属性跟随应用的明暗主题。

前端采用 React 19 和 Tailwind CSS 4，需要较新的 WebView 引擎。Windows 应保持 WebView2 更新，macOS / Linux 的系统 WebKit 需要支持 Tailwind 4 所需的现代 CSS 能力（Safari 16.4 同代及以后）。

## 交互回归

`tests/ui/` 使用 `docs/preview.html` 中的示例数据，不连接真实 Caddy 或修改本机配置。图标编辑测试替换示例桥接层，在内存中模拟配置保存。测试覆盖键盘筛选、设置分类切换、数字范围、未保存确认、折叠参数保留、菜单焦点、日志筛选、主题、桌面侧栏折叠与布局记忆、移动侧栏、环境状态以及图标的创建、编辑和恢复默认。

测试报告、失败追踪和界面截图位于忽略提交的 `artifacts/ui-tests/`。GitHub Actions 的 UI 检查与四个平台的原生检查共同汇总到 `Checks passed`。
