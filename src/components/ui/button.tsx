import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

// Focus is the global :focus-visible ring from globals.css, the same as on every other control.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 border border-transparent font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity,transform] select-none active:not-aria-[haspopup]:not-disabled:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
        ghost: 'text-brand-foreground hover:bg-muted aria-expanded:bg-muted',
        outline: 'border-border bg-card text-primary hover:border-primary',
        link: 'text-primary hover:text-primary-hover',
      },
      size: {
        sm: 'h-9 rounded-md px-3 text-sm',
        default: 'h-10 rounded-md px-4 text-base',
        lg: 'h-14 rounded-lg px-7 text-lg',
        icon: 'size-11 rounded-full',
        'icon-sm': 'size-9 rounded-full',
      },
      shape: {
        default: '',
        pill: 'rounded-full',
      },
    },
    compoundVariants: [
      // Large primary actions float above the panel.
      { variant: 'default', size: 'lg', className: 'shadow-(--shadow-primary)' },
      // A link has no box: only the text and the icon.
      { variant: 'link', className: 'h-auto rounded-sm border-0 px-0' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shape: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  shape,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, shape, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
