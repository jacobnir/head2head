import { useEffect, useRef } from 'react'
import { attach, detach } from './particles'

/** Fullscreen particle layer. Sits above everything, eats no clicks. */
export function FxCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (ref.current) attach(ref.current)
    return () => detach()
  }, [])

  return <canvas ref={ref} className="fx-canvas" aria-hidden />
}
