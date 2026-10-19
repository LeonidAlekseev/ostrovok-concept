'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { todayIso } from '@/lib/dates'
import { cancelBooking, cancellationFee, feeLabel } from '@/lib/trips'
import { saveBooking, type Booking } from '@/lib/storage'

export function CancelDialog({ booking }: { booking: Booking }) {
  const fee = cancellationFee(booking, todayIso())
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Отменить бронирование</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отменить бронирование {booking.id}?</DialogTitle>
          <DialogDescription>Условия отмены на сегодня:</DialogDescription>
        </DialogHeader>
        <p className="text-lg font-bold">{feeLabel(fee)}</p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Оставить бронирование</DialogClose>
          <Button onClick={() => saveBooking(cancelBooking(booking, new Date(), todayIso()))}>
            Подтвердить отмену
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
