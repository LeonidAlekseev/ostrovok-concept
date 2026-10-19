import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { cn } from 'cn'

// Focus leaving the popover does not close it: as before, only a press outside or Escape does.
function Popover({ onOpenChange, ...props }: PopoverPrimitive.Root.Props) {
  return (
    <PopoverPrimitive.Root
      data-slot="popover"
      onOpenChange={(open, details) => {
        if (!open && details.reason === 'focus-out') return
        onOpenChange?.(open, details)
      }}
      {...props}
    />
  )
}

function PopoverTrigger({ className, ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" className={cn(className)} {...props} />
}

function PopoverContent({
  className,
  align = 'start',
  sideOffset = 8,
  collisionAvoidance,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'sideOffset' | 'collisionAvoidance'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        sideOffset={sideOffset}
        collisionAvoidance={collisionAvoidance}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn('flex flex-col rounded-xl bg-card text-card-foreground outline-none', className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
