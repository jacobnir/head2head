import { useEffect, useState } from 'react'
import { peekTrimmed, trimFace } from '../lib/trimFace'

type Props = {
  src: string
  alt: string
  className?: string
}

/** A roster face, auto-cropped to its visible pixels so every portrait fills its frame. */
export function Face({ src, alt, className }: Props) {
  const [resolved, setResolved] = useState(() => peekTrimmed(src) ?? src)

  useEffect(() => {
    let alive = true
    const cached = peekTrimmed(src)
    if (cached) {
      setResolved(cached)
      return
    }
    void trimFace(src).then((url) => {
      if (alive) setResolved(url)
    })
    return () => {
      alive = false
    }
  }, [src])

  return <img className={className} src={resolved} alt={alt} draggable={false} />
}
