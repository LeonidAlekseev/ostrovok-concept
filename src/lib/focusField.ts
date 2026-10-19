/** Focuses the field with this id; a checkbox's id is on its hidden input, so its visible box gets the focus. */
export function focusField(id: string) {
  const element = document.getElementById(id)
  const target =
    element instanceof HTMLInputElement && element.type === 'checkbox'
      ? element.parentElement?.querySelector<HTMLElement>('[role=checkbox]')
      : element
  target?.focus()
}
