import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'

/**
 * «демо»: synthetic demonstration data — the demo hotelier's answers, the demo conversations and the characteristics
 * taken from them. Never shown as a real hotel's data.
 */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      className={cn('h-4 px-1.5 align-middle text-[11px]', className)}
      title="Демонстрационные данные, не настоящий ответ отеля"
    >
      демо
    </Badge>
  )
}
