import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Страница не найдена — Островок!' }

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col items-start gap-4 px-(--page-x) py-[clamp(32px,8vw,80px)]">
      <h1 className="text-title font-bold tracking-[-0.02em]">Страница не найдена</h1>
      <p className="text-muted-foreground">Возможно, адрес набран с ошибкой или страница переехала.</p>
      <div className="flex flex-wrap gap-3">
        <Link className={buttonVariants()} href="/">
          На главную
        </Link>
        <Link className={buttonVariants({ variant: 'outline' })} href="/#search">
          Найти отель
        </Link>
      </div>
    </main>
  )
}
