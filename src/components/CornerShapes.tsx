'use client'

import { useEffect } from 'react'
import { registerHyperellipse } from 'hyperellipse'

/** Starts the hyperellipse polyfill, which draws squircle corners in browsers without `corner-shape`. */
export function CornerShapes() {
  useEffect(() => {
    registerHyperellipse()
  }, [])
  return null
}
