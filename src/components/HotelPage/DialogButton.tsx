'use client'

import type { ComponentType, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DialogTrigger } from '@/components/ui/dialog'

/**
 * The one look of the hotel page's buttons: a light pill as wide as its text with an icon on the
 * left. Each opens a dialog, which returns focus here when it closes.
 */
export function DialogButton({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ 'aria-hidden'?: boolean }>
  children: ReactNode
}) {
  return (
    <DialogTrigger render={<Button variant="secondary" shape="pill" className="self-start" />}>
      <Icon aria-hidden />
      {children}
    </DialogTrigger>
  )
}
