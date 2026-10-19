import { Compass, Plane } from 'lucide-react'

export function TravelBanner() {
  return (
    <section
      className="relative flex min-h-[clamp(64px,17vw,120px)] items-center gap-[clamp(12px,3.6vw,28px)] overflow-hidden rounded-[clamp(18px,4.6vw,26px)] bg-muted px-[clamp(16px,4.6vw,36px)] py-[clamp(12px,3.4vw,26px)]"
      id="explore"
      aria-labelledby="explore-title"
    >
      <span
        className="grid size-[clamp(38px,10.4vw,72px)] flex-none place-items-center rounded-full bg-success-soft text-brand-foreground [&_svg]:size-[54%]"
        aria-hidden
      >
        <Compass size={22} strokeWidth={1.8} />
      </span>
      <p className="relative z-1 m-0 flex flex-col gap-0.5">
        <strong id="explore-title" className="text-[clamp(14px,3.8vw,22px)] font-[650] tracking-[-0.01em]">
          Исследуйте мир —
        </strong>
        <span className="text-[clamp(12px,3.3vw,18px)] text-muted-foreground">выбирайте свой следующий отель</span>
      </p>
      <span
        className="pointer-events-none absolute top-[clamp(14px,3.6vw,24px)] right-[clamp(22px,5.6vw,48px)] w-[clamp(84px,23vw,220px)] text-success md:top-1/2 md:[translate:0_-50%]"
        aria-hidden
      >
        <svg className="block h-auto w-full" viewBox="0 0 180 70" preserveAspectRatio="xMaxYMid meet">
          <path
            className="fill-none stroke-(--decor-trail) stroke-2 [stroke-dasharray:5_6] [stroke-linecap:round]"
            d="M4 40 C 18 10, 46 2, 54 22 S 50 66, 84 60 S 132 40, 150 28"
          />
        </svg>
        <Plane
          className="absolute top-0 right-0 h-auto w-[22%] [rotate:10deg]"
          size={30}
          fill="currentColor"
          strokeWidth={1}
        />
      </span>
    </section>
  )
}
