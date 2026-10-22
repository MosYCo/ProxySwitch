export const entityIcons = [
  { id: "folder", label: "文件夹" }, { id: "code", label: "代码" },
  { id: "globe", label: "地球" }, { id: "flask", label: "实验" },
  { id: "server", label: "服务器" }, { id: "shopping-bag", label: "购物袋" },
  { id: "credit-card", label: "银行卡" }, { id: "database", label: "数据库" },
  { id: "cloud", label: "云端" }, { id: "monitor", label: "电脑" },
  { id: "smartphone", label: "手机" }, { id: "terminal", label: "终端" },
  { id: "box", label: "应用" }, { id: "git-branch", label: "分支" },
  { id: "layers", label: "图层" }, { id: "zap", label: "闪电" },
  { id: "rocket", label: "火箭" }, { id: "shield", label: "盾牌" },
  { id: "briefcase", label: "公文包" }, { id: "palette", label: "调色板" },
  { id: "wrench", label: "工具" }, { id: "package", label: "包裹" },
  { id: "activity", label: "脉搏" }, { id: "network", label: "网络" },
] as const

export type EntityIconName = typeof entityIcons[number]["id"]
export const emojiIcons = ["🚀", "🛒", "💳", "📦", "🧪", "💻", "🌍", "☁️", "🔧", "⚡", "🎨", "🎯", "📊", "🔒", "🌱", "🦊", "🐳", "🤖", "🔥", "🏠", "🏢", "🎮", "💡", "⭐"]

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u

export function normalizeEmoji(value: string): string | null {
  const text = value.trim().normalize("NFC")
  if (!text || text.length > 32 || !emoji.test(text) || [...graphemes.segment(text)].length !== 1) return null
  return text
}

export function resolveEntityIcon(value: string | null | undefined, fallback: EntityIconName = "folder") {
  const customEmoji = value?.startsWith("emoji:") ? normalizeEmoji(value.slice(6)) : null
  if (customEmoji) return { name: fallback, emoji: customEmoji, label: customEmoji }
  const icon = entityIcons.find(item => item.id === value) ?? entityIcons.find(item => item.id === fallback)!
  return { name: icon.id, emoji: null, label: icon.label }
}

export function environmentAppearance(name: string): { icon: EntityIconName; color: string } {
  const value = name.toLowerCase()
  if (/prod|production|生产/.test(value)) return { icon: "globe", color: "bg-info/10 text-info" }
  if (/test|stag|qa|uat|测试|预发/.test(value)) return { icon: "flask", color: "bg-warning/10 text-warning" }
  if (/dev|local|开发|本地/.test(value)) return { icon: "code", color: "bg-primary/10 text-primary" }
  return { icon: "server", color: "bg-primary/10 text-primary" }
}
