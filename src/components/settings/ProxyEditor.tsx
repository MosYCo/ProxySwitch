import { inputBehavior } from "@/lib/inputBehavior"
import { forwardRef, useEffect, useImperativeHandle, useState } from "react"
import type { HealthOverride, ProxyOptions } from "@/api"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatHeaderRules, parseHeaderRules, parseStatusCodes } from "@/lib/settings"
import { SettingField, SettingNumber, SettingSelect } from "./SettingsFields"

export interface ProxyEditorHandle { read: () => ProxyOptions }
export const ProxyEditor = forwardRef<ProxyEditorHandle, { initialValue?: ProxyOptions; inherited?: ProxyOptions; onEdited?: () => void }>(({ initialValue, inherited, onEdited }, ref) => {
  const [value, setValue] = useState<ProxyOptions>(initialValue || {})
  const [request, setRequest] = useState(formatHeaderRules(initialValue?.request_headers))
  const [response, setResponse] = useState(formatHeaderRules(initialValue?.response_headers))
  useEffect(() => { setValue(initialValue || {}); setRequest(formatHeaderRules(initialValue?.request_headers)); setResponse(formatHeaderRules(initialValue?.response_headers)) }, [initialValue])
  const update = (patch: Partial<ProxyOptions>) => { setValue((current) => ({ ...current, ...patch })); onEdited?.() }
  useImperativeHandle(ref, () => ({ read: () => {
    if (value.connect_timeout_ms != null && (!Number.isInteger(value.connect_timeout_ms) || value.connect_timeout_ms < 100 || value.connect_timeout_ms > 300000)) throw new Error("连接超时须为 100–300000 毫秒")
    if (value.response_timeout_ms != null && (!Number.isInteger(value.response_timeout_ms) || value.response_timeout_ms < 0 || value.response_timeout_ms > 3600000)) throw new Error("响应头超时须为 0–3600000 毫秒")
    return { ...value, host: value.host?.trim() || null, request_headers: parseHeaderRules(request), response_headers: parseHeaderRules(response) }
  } }), [value, request, response])
  return <div className="space-y-5">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><SettingNumber label="连接超时（毫秒）" min={100} max={300000} value={value.connect_timeout_ms} placeholder={inherited?.connect_timeout_ms ? `继承 ${inherited.connect_timeout_ms}` : "继承上级 / Caddy 默认"} onChange={(v) => update({ connect_timeout_ms: v })} /><SettingNumber label="响应头超时（毫秒）" min={0} max={3600000} value={value.response_timeout_ms} placeholder={inherited?.response_timeout_ms != null ? `继承 ${inherited.response_timeout_ms}` : "继承上级 / 默认不限时"} onChange={(v) => update({ response_timeout_ms: v })} /></div>
    <p className="text-xs leading-5 text-muted-foreground">等待后端响应头的时限。0 表示不限时；流式接口可保持不限时。</p>
    <SettingField label="自定义 Host" description="留空继承上级；上级未设置时使用后端地址中的主机名。"><Input {...inputBehavior} aria-label="自定义 Host" value={value.host || ""} placeholder={inherited?.host || "例如 api.example.com"} onChange={(event) => update({ host: event.target.value || null })} /></SettingField>
    <SettingField label="请求 Header 规则" description="每行一条：X-Client: desktop。删除使用 -X-Client。同名规则覆盖上级，其余继承。"><Textarea {...inputBehavior} aria-label="请求 Header 规则" value={request} onChange={(event) => { setRequest(event.target.value); onEdited?.() }} className="font-mono text-xs" placeholder={inherited?.request_headers && Object.keys(inherited.request_headers).length ? `继承：\n${formatHeaderRules(inherited.request_headers)}` : "X-Client: desktop\n-X-Debug"} /></SettingField>
    <SettingField label="响应 Header 规则"><Textarea {...inputBehavior} aria-label="响应 Header 规则" value={response} onChange={(event) => { setResponse(event.target.value); onEdited?.() }} className="font-mono text-xs" placeholder={inherited?.response_headers && Object.keys(inherited.response_headers).length ? `继承：\n${formatHeaderRules(inherited.response_headers)}` : "X-Proxy: caddy\n-Server"} /></SettingField>
  </div>
})
ProxyEditor.displayName = "ProxyEditor"

export interface HealthEditorHandle { read: () => HealthOverride }
export const HealthEditor = forwardRef<HealthEditorHandle, { initialValue?: HealthOverride }>(({ initialValue }, ref) => {
  const [value, setValue] = useState<HealthOverride>(initialValue || {})
  const [statuses, setStatuses] = useState(initialValue?.expected_statuses?.join(", ") || "")
  const [customStatuses, setCustomStatuses] = useState(initialValue?.expected_statuses != null)
  useEffect(() => { setValue(initialValue || {}); setStatuses(initialValue?.expected_statuses?.join(", ") || ""); setCustomStatuses(initialValue?.expected_statuses != null) }, [initialValue])
  useImperativeHandle(ref, () => ({ read: () => {
    if (value.timeout_ms != null && (!Number.isInteger(value.timeout_ms) || value.timeout_ms < 100 || value.timeout_ms > 60000)) throw new Error("健康检查超时须为 100–60000 毫秒")
    return { ...value, path: value.path?.trim() || null, expected_statuses: customStatuses ? parseStatusCodes(statuses) : null }
  } }), [value, statuses, customStatuses])
  return <div className="space-y-5">
    <SettingField label="健康检查"><SettingSelect label="健康检查覆盖" value={value.enabled == null ? "inherit" : String(value.enabled)} onValueChange={(next) => setValue({ ...value, enabled: next === "inherit" ? null : next === "true" })} options={[{ value: "inherit", label: "继承上级设置" }, { value: "true", label: "启用" }, { value: "false", label: "关闭" }]} /></SettingField>
    <SettingField label="检查路径" description="拼接到后端地址的基础路径后。留空继承，例如 /health 或 /actuator/health。"><Input {...inputBehavior} aria-label="健康检查路径覆盖" value={value.path || ""} onChange={(event) => setValue({ ...value, path: event.target.value || null })} placeholder="继承上级" /></SettingField>
    <SettingNumber label="检查超时（毫秒）" min={100} max={60000} value={value.timeout_ms} onChange={(v) => setValue({ ...value, timeout_ms: v })} placeholder="继承上级" />
    <SettingField label="预期状态码"><SettingSelect label="状态码继承方式" value={customStatuses ? "custom" : "inherit"} onValueChange={(next) => setCustomStatuses(next === "custom")} options={[{ value: "inherit", label: "继承上级设置" }, { value: "custom", label: "自定义" }]} />{customStatuses && <Input {...inputBehavior} aria-label="健康检查预期状态码覆盖" value={statuses} onChange={(event) => setStatuses(event.target.value)} placeholder="留空接受 200–399；例如 200, 204" />}</SettingField>
    <SettingField label="检查路径不存在时回退到 /"><SettingSelect label="回退根路径覆盖" value={value.fallback_to_root == null ? "inherit" : String(value.fallback_to_root)} onValueChange={(next) => setValue({ ...value, fallback_to_root: next === "inherit" ? null : next === "true" })} options={[{ value: "inherit", label: "继承上级设置" }, { value: "true", label: "允许回退" }, { value: "false", label: "只检查指定路径" }]} /></SettingField>
    <p className="text-xs leading-5 text-muted-foreground">全局健康检查关闭或项目停用时，所有环境均暂停检查。</p>
  </div>
})
HealthEditor.displayName = "HealthEditor"
