import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { cn } from '@/lib/utils'

function Combobox<Value, Item = Value>(props: ComboboxPrimitive.Root.Props<Value, false, Item>) {
  return <ComboboxPrimitive.Root data-slot="combobox" {...props} />
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return <ComboboxPrimitive.Input data-slot="combobox-input" className={cn(className)} {...props} />
}

// The group is the anchor of the list: the list takes the group's width (--anchor-width).
function ComboboxInputGroup({ className, ...props }: ComboboxPrimitive.InputGroup.Props) {
  return <ComboboxPrimitive.InputGroup data-slot="combobox-input-group" className={cn(className)} {...props} />
}

function ComboboxContent({
  className,
  align = 'start',
  sideOffset = 8,
  collisionAvoidance,
  container,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, 'align' | 'sideOffset' | 'collisionAvoidance'> & {
    /** Where the list mounts. Base UI hides everything outside the portal container from assistive tech while open. */
    container?: ComboboxPrimitive.Portal.Props['container']
  }) {
  return (
    <ComboboxPrimitive.Portal container={container}>
      <ComboboxPrimitive.Positioner
        align={align}
        sideOffset={sideOffset}
        collisionAvoidance={collisionAvoidance}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup data-slot="combobox-content" className={cn(className)} {...props} />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return <ComboboxPrimitive.List data-slot="combobox-list" className={cn(className)} {...props} />
}

function ComboboxItem({ className, ...props }: ComboboxPrimitive.Item.Props) {
  return <ComboboxPrimitive.Item data-slot="combobox-item" className={cn(className)} {...props} />
}

export { Combobox, ComboboxInput, ComboboxInputGroup, ComboboxContent, ComboboxList, ComboboxItem }
