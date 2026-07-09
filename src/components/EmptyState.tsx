import { Server, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface EmptyStateProps {
  onAdd: () => void
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <Card className="border-dashed border-border/50">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 bg-muted rounded-sm flex items-center justify-center mb-4 border border-border/50">
          <Server className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-sm font-display font-semibold mb-1">暂无项目</h3>
        <p className="text-xs text-muted-foreground text-center max-w-sm mb-4 font-mono">
          添加您的第一个前端项目以开始使用代理管理器
        </p>
        <Button size="sm" className="text-xs font-mono" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" />
          添加项目
        </Button>
      </CardContent>
    </Card>
  )
}
