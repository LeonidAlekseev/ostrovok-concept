import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { cn } from 'cn'

function Combobox<Value, Item = Value>(props: ComboboxPrimitive.Root.Props<Value, false, Item>) {
  return <ComboboxPrimitive.Root data-slot="combobox" {...props} />
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return <ComboboxPrimitive.Input data-slot="combobox-input" className={cn(className)} {...props} />
}

function ComboboxContent({
  className,
  align = 'start',
  sideOffset = 8,
  ...props
}: ComboboxPrimitive.Popup.Props & Pick<ComboboxPrimitive.Positioner.Props, 'align' | 'sideOffset'>) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner align={align} sideOffset={sideOffset}>
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

export { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem }
