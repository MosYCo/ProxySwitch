import { ArrowRight, GitBranch, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <Empty className="border bg-card py-14">
    <EmptyHeader><EmptyMedia variant="icon"><GitBranch /></EmptyMedia><EmptyTitle>创建第一个代理项目</EmptyTitle><EmptyDescription>配置一个固定的本地入口，添加开发、测试等后端环境，即可随时切换。</EmptyDescription></EmptyHeader>
    <EmptyContent><Button onClick={onAdd}><Plus />创建项目<ArrowRight /></Button></EmptyContent>
  </Empty>
}
