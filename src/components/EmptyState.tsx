import { Server, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface EmptyStateProps {
  onAdd: () => void
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <Card className="border-dashed border-border/50">
      <CardHeader className="items-center pb-3 text-center">
        <div className="mb-2 flex size-14 items-center justify-center rounded-sm border bg-muted">
          <Server className="size-7 text-muted-foreground" />
        </div>
        <CardTitle className="text-sm">暂无项目</CardTitle>
        <CardDescription className="max-w-sm">
          添加第一个项目后，就可以为不同环境配置代理线路。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center pb-12">
        <Button size="sm" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          添加项目
        </Button>
      </CardContent>
    </Card>
  )
}
