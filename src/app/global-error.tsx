'use client'

import { Button } from '@/components/ui/button'
import './globals.css'

/** The root layout failed (it reads the destinations): its own document, as Next requires. */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ru">
      <body className="flex min-h-dvh flex-col">
        <title>Каталог недоступен — О!Погнали</title>
        <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col items-start gap-4 px-(--page-x) py-[clamp(32px,8vw,80px)]">
          <h1 className="text-title font-bold tracking-[-0.02em]">Не удалось загрузить страницу</h1>
          <p className="text-muted-foreground">Каталог отелей временно недоступен. Попробуйте ещё раз через минуту.</p>
          <Button onClick={() => retry()}>Повторить</Button>
        </main>
      </body>
    </html>
  )
}
