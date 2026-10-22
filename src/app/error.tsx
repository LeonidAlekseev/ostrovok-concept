'use client'

import { Button } from '@/components/ui/button'

/** A page that could not be built, most likely because the catalogue is unavailable: a retry, not a crash. */
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col items-start gap-4 px-(--page-x) py-[clamp(32px,8vw,80px)]">
      <h1 className="text-title font-bold tracking-[-0.02em]">Не удалось загрузить страницу</h1>
      <p className="text-muted-foreground">Каталог отелей временно недоступен. Попробуйте ещё раз через минуту.</p>
      <Button onClick={() => retry()}>Повторить</Button>
    </main>
  )
}
