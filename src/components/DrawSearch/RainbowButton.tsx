import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'

/**
 * The look of the main actions of the draw search: white text on the rainbow of the palette, with a soft glow under
 * it. The shadow under the text keeps it readable over the yellow and orange middle. For links with
 * `buttonVariants({ size: 'lg' })`.
 */
export const rainbowClass =
  'gap-3 bg-(image:--decor-rainbow) font-bold text-white shadow-(--decor-rainbow-shadow) text-shadow-[0_1px_3px_rgb(0_0_0/0.3)] hover:bg-(image:--decor-rainbow) hover:brightness-105'

export function RainbowButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button size="lg" className={cn(rainbowClass, className)} {...props} />
}
