// The bordered box of the date, guests and destination fields, with the row of its icon and value. Base UI
// sets data-popup-open on the popover trigger; the input label uses :focus-within-style matching through has-[].
export function fieldBox(invalid: boolean) {
  const base =
    'flex h-[clamp(48px,12.4vw,56px)] w-full items-center gap-[clamp(8px,2.3vw,16px)] px-[clamp(10px,3vw,18px)] lg:h-15 border bg-card text-left text-foreground rounded-lg transition-[border-color,box-shadow]'
  return invalid
    ? `${base} border-destructive hover:border-destructive`
    : `${base} border-border hover:border-(--decor-border-strong) has-[>input:focus]:border-primary data-popup-open:border-primary`
}
