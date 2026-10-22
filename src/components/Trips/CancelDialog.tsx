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
import { useHotel } from '@/hooks/useHotels'
import { todayIso } from '@/lib/dates'
import { cancelBooking, cancellationFee, feeLabel } from '@/lib/trips'
import { saveBooking, type Booking } from '@/lib/storage'

export function CancelDialog({ booking }: { booking: Booking }) {
  // The fee depends on the hotel's rate: nothing to confirm until it is loaded (an unknown hotel counts as gone).
  const { status, hotel } = useHotel(booking.hotelId)
  const loading = status === 'loading'
  const fee = cancellationFee(booking, todayIso(), hotel)
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Отменить бронирование</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отменить бронирование {booking.id}?</DialogTitle>
          <DialogDescription>Условия отмены на сегодня:</DialogDescription>
        </DialogHeader>
        <p className="text-lg font-bold">{loading ? 'Считаем…' : feeLabel(fee)}</p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Оставить бронирование</DialogClose>
          <Button
            variant="destructive"
            disabled={loading}
            onClick={() => saveBooking(cancelBooking(booking, new Date(), todayIso(), hotel))}
          >
            Подтвердить отмену
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
