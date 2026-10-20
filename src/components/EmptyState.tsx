import { ArrowRight, GitBranch, Layers, Plus, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps { onAdd: () => void }

export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <section className="surface flex flex-col items-center px-6 py-14 text-center">
      <div className="relative mb-7 flex items-center gap-4" aria-hidden="true">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground"><Radio className="size-5" strokeWidth={1.5} /></div>
        <span className="w-7 border-t border-dashed border-primary/35" />
        <div className="flex size-16 items-center justify-center rounded-2xl border border-primary/15 bg-accent text-primary shadow-[0_0_0_8px_hsl(var(--primary)/0.03)]"><GitBranch className="size-7" strokeWidth={1.5} /></div>
        <span className="w-7 border-t border-dashed border-primary/35" />
        <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground"><Layers className="size-5" strokeWidth={1.5} /></div>
      </div>
      <h2 className="text-lg font-semibold tracking-tight">让你的代理配置，井然有序</h2>
      <p className="mt-3 max-w-sm text-xs leading-6 text-muted-foreground">创建一个项目，添加不同的后端环境。<br />从本地开发到生产环境，一键切换，轻松管理。</p>
      <Button className="mt-6" onClick={onAdd}><Plus className="size-4" />创建第一个项目<ArrowRight className="ml-2 size-3.5" /></Button>
      <div className="mt-10 flex flex-wrap justify-center gap-x-7 gap-y-2 text-[11px] text-muted-foreground">
        <span>01 <span className="ml-1.5">配置监听端口</span></span><span>02 <span className="ml-1.5">添加后端环境</span></span><span>03 <span className="ml-1.5">启用代理</span></span>
      </div>
    </section>
  )
}
