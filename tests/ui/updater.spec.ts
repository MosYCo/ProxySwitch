import { test, expect, type Page } from "@playwright/test"

type UpdateMock = { checks: number; downloads: number; installs: number; releasePages: number; failDownload: boolean; finishDownload: (() => void) | null }

async function mockUpdater(page: Page, options: { installSupported?: boolean; failDownload?: boolean; latest?: boolean } = {}) {
  await page.addInitScript(options => {
    const testWindow = window as unknown as { __updateMock: UpdateMock }
    testWindow.__updateMock = { checks: 0, downloads: 0, installs: 0, releasePages: 0, failDownload: !!options.failDownload, finishDownload: null }
    let api: unknown
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      get: () => api,
      set: value => {
        const original = value.invoke
        value.invoke = async (command: string, args: Record<string, unknown> = {}) => {
          const mock = testWindow.__updateMock
          if (command === "get_updater_status") return { current_version: "0.2.0", check_supported: true, install_supported: options.installSupported !== false, reason: options.installSupported === false ? "当前安装格式需手动更新，请从发布页下载对应安装包。AppImage 支持应用内更新。" : null }
          if (command === "check_app_update") { mock.checks++; return options.latest ? null : { version: "0.3.0", notes: "新增应用内更新\n修复环境切换", published_at: "2026-10-21T00:00:00Z" } }
          if (command === "download_app_update") {
            mock.downloads++
            if (mock.failDownload) { mock.failDownload = false; throw new Error("下载或签名校验失败，未安装更新，可重试。") }
            const channel = args.onProgress as { onmessage: (value: { downloaded: number; total: number }) => void }
            channel.onmessage({ downloaded: 5 * 1024 * 1024, total: 10 * 1024 * 1024 })
            await new Promise<void>(resolve => { mock.finishDownload = () => { channel.onmessage({ downloaded: 10 * 1024 * 1024, total: 10 * 1024 * 1024 }); resolve() } })
            return null
          }
          if (command === "install_app_update") { mock.installs++; return new Promise(() => {}) }
          if (command === "open_release_page") { mock.releasePages++; return null }
          return original(command, args)
        }
        api = value
      },
    })
  }, options)
  await page.goto("/docs/preview.html")
  await page.getByRole("button", { name: "应用更新", exact: true }).click()
  await expect(page.getByRole("button", { name: "检查更新", exact: true })).toBeEnabled()
}

const readMock = (page: Page) => page.evaluate(() => (window as unknown as { __updateMock: UpdateMock }).__updateMock)

test("自动检查提醒新版本，下载可在后台继续，安装始终需要确认", async ({ page }) => {
  await page.clock.install()
  await mockUpdater(page)
  await page.getByRole("dialog", { name: "应用更新", exact: true }).getByRole("button", { name: "Close", exact: true }).click()
  await page.clock.runFor(5100)
  await expect(page.getByRole("button", { name: "应用更新，有新版本", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "应用更新，有新版本", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "应用更新", exact: true })
  await expect(dialog.getByText("发现新版本 v0.3.0", { exact: true })).toBeVisible()
  await expect(dialog.getByText(/新增应用内更新/)).toBeVisible()
  await dialog.getByRole("button", { name: "下载更新", exact: true }).click()
  await expect(dialog.getByRole("progressbar", { name: "更新下载进度" })).toHaveAttribute("aria-valuenow", "50")
  await expect(dialog.getByText("50%", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await page.evaluate(() => (window as unknown as { __updateMock: UpdateMock }).__updateMock.finishDownload?.())
  await page.getByRole("button", { name: "应用更新，有新版本", exact: true }).click()
  await expect(dialog.getByText("更新已准备好", { exact: true })).toBeVisible()
  expect((await readMock(page)).installs).toBe(0)
  await dialog.getByRole("button", { name: "安装并重启", exact: true }).click()
  const confirmation = page.getByRole("alertdialog")
  await expect(confirmation.getByText(/代理请求会短暂中断/)).toBeVisible()
  await confirmation.getByRole("button", { name: "稍后安装", exact: true }).click()
  expect((await readMock(page)).installs).toBe(0)
  await dialog.getByRole("button", { name: "安装并重启", exact: true }).click()
  await confirmation.getByRole("button", { name: "确认安装并重启", exact: true }).click()
  await expect(dialog.getByText("正在安装更新", { exact: true })).toBeVisible()
  await expect(dialog.getByRole("button", { name: "安装中", exact: true })).toBeDisabled()
  expect((await readMock(page)).installs).toBe(1)
})

test("关闭自动检查后重启仍保留偏好，可以手动检查最新版本", async ({ page }) => {
  await page.clock.install()
  await mockUpdater(page, { latest: true })
  await page.getByRole("switch", { name: "自动检查更新", exact: true }).click()
  await page.reload()
  await page.getByRole("button", { name: "应用更新", exact: true }).click()
  await expect(page.getByRole("switch", { name: "自动检查更新", exact: true })).not.toBeChecked()
  await page.clock.fastForward(6 * 60 * 60 * 1000 + 6000)
  expect((await readMock(page)).checks).toBe(0)
  await page.getByRole("button", { name: "检查更新", exact: true }).click()
  await expect(page.getByText("已是最新版本", { exact: true })).toBeVisible()
  expect((await readMock(page)).checks).toBe(1)
})

test("签名校验失败不会进入安装，可重新下载", async ({ page }) => {
  await mockUpdater(page, { failDownload: true })
  const dialog = page.getByRole("dialog", { name: "应用更新", exact: true })
  await dialog.getByRole("button", { name: "检查更新", exact: true }).click()
  await dialog.getByRole("button", { name: "下载更新", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("签名校验失败")
  await expect(dialog.getByRole("button", { name: "安装并重启", exact: true })).toHaveCount(0)
  expect((await readMock(page)).installs).toBe(0)
  await dialog.getByRole("button", { name: "下载更新", exact: true }).click()
  await page.evaluate(() => (window as unknown as { __updateMock: UpdateMock }).__updateMock.finishDownload?.())
  await expect(dialog.getByRole("button", { name: "安装并重启", exact: true })).toBeEnabled()
  expect((await readMock(page)).downloads).toBe(2)
})

test("手动更新的安装格式显示发布页入口，小窗口可访问所有操作", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 640 })
  await mockUpdater(page, { installSupported: false })
  const dialog = page.getByRole("dialog", { name: "应用更新", exact: true })
  await dialog.getByRole("button", { name: "检查更新", exact: true }).click()
  await expect(dialog.getByText(/当前安装格式需手动更新/)).toBeVisible()
  await expect(dialog.getByRole("button", { name: "下载更新", exact: true })).toHaveCount(0)
  const open = dialog.getByRole("button", { name: "发布页", exact: true })
  await open.scrollIntoViewIfNeeded()
  await expect(open).toBeInViewport()
  await open.click()
  expect((await readMock(page)).releasePages).toBe(1)
  const bounds = await dialog.boundingBox()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640)
  await page.screenshot({ path: test.info().outputPath("updates.png"), fullPage: true, animations: "disabled" })
})
