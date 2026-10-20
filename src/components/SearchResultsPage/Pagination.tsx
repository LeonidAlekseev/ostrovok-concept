import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { buttonVariants } from '@/components/ui/button'
import { pageItems } from '../../lib/results'

interface Props {
  page: number
  pages: number
  /** The link to a page, keeping the rest of the query. */
  hrefFor: (page: number) => string
  /** Pressing a link pushes a history entry itself, without a navigation. */
  onNavigate: (page: number) => void
}

/** «‹ 1 2 3 ›» under the list; not shown for a single page. */
export function Pagination({ page, pages, hrefFor, onNavigate }: Props) {
  if (pages <= 1) return null
  const link = (target: number, label: string, children: React.ReactNode, current = false) => (
    <Link
      href={hrefFor(target)}
      scroll={false}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(buttonVariants({ variant: current ? 'default' : 'ghost', size: 'icon-sm' }))}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        if (!current) onNavigate(target)
      }}
    >
      {children}
    </Link>
  )
  return (
    <nav aria-label="Страницы результатов" className="flex justify-center">
      <ul className="flex flex-wrap items-center justify-center gap-1">
        {page > 1 && <li>{link(page - 1, 'Предыдущая страница', <ChevronLeft aria-hidden />)}</li>}
        {pageItems(page, pages).map((n, i) => (
          <li key={n ?? `gap-${i}`}>
            {n === null ? (
              <span aria-hidden className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              link(n, `Страница ${n}`, n, n === page)
            )}
          </li>
        ))}
        {page < pages && <li>{link(page + 1, 'Следующая страница', <ChevronRight aria-hidden />)}</li>}
      </ul>
    </nav>
  )
}
