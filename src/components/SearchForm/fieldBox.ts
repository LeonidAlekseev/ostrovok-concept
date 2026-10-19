// The bordered box of the date, guests and destination fields. Base UI sets data-popup-open on the
// popover trigger; the input label uses :focus-within-style matching through has-[].
export function fieldBox(invalid: boolean) {
  const base = 'border bg-card text-left text-foreground rounded-lg transition-[border-color,box-shadow]'
  return invalid
    ? `${base} border-destructive hover:border-destructive`
    : `${base} border-border hover:border-(--decor-border-strong) has-[>input:focus]:border-primary data-popup-open:border-primary`
}
