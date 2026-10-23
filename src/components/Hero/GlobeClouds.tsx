import Image from 'next/image'
import { CLOUD_IMAGES } from './cloudImages'

/**
 * Clouds along the bottom of the hero, in percent of the globe box: they frame the globe and leave the disc itself
 * open. A small flat cloud stands in the middle and a medium one on the right; the big cloud at the left carries
 * the «Рандом» button (see Hero). The hero ends a little past the middle of the globe, so the clouds peek from under
 * the content below it. Only the left half of the box is on a phone's screen. Negative delays start each cloud at
 * its own point of the drift.
 */
const CLOUDS = [
  {
    image: CLOUD_IMAGES.flat,
    place: 'top-[50%] left-[16%] w-[52%] md:top-[47%] md:left-[30%] md:w-[42%]',
    drift: '[animation-delay:-2s]',
  },
  {
    image: CLOUD_IMAGES.medium,
    place: 'top-[46%] left-[50%] w-[46%] md:top-[45%] md:left-[66%] md:w-[42%]',
    drift: '[animation-delay:-11s] [animation-direction:alternate-reverse]',
  },
]

/**
 * Photo clouds overlapping the edge of the globe. Purely decorative: hidden from assistive technology, they let
 * every press through to the globe and the pins, which are painted above them.
 */
export function GlobeClouds() {
  return CLOUDS.map(({ image, place, drift }) => (
    <div key={image.src} className={`pointer-events-none absolute ${place}`} aria-hidden>
      <Image
        {...image}
        alt=""
        sizes="(max-width: 767px) 280px, 460px"
        className={`block h-auto w-full animate-cloud-drift select-none motion-reduce:animate-none ${drift}`}
        draggable={false}
      />
    </div>
  ))
}
