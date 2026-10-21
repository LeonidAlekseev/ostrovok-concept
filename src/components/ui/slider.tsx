'use client'

import { useMemo } from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from 'cn'

interface SliderProps extends SliderPrimitive.Root.Props {
  /** Names of the thumbs for screen readers, in their order. */
  thumbLabels?: string[]
}

function Slider({ className, defaultValue, value, min = 0, max = 100, thumbLabels, ...props }: SliderProps) {
  const values = useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  )
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn('w-full', className)}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center py-2 select-none data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted select-none"
        >
          <SliderPrimitive.Indicator data-slot="slider-range" className="h-full bg-primary select-none" />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            index={index}
            getAriaLabel={thumbLabels ? (i) => thumbLabels[i] : undefined}
            data-slot="slider-thumb"
            className="block size-5 shrink-0 rounded-full border-2 border-primary bg-card shadow-(--shadow-card) transition-[box-shadow] select-none hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-hidden active:ring-4 active:ring-ring/30 data-disabled:pointer-events-none"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
