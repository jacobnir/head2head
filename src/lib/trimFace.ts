/**
 * Cutout PNGs usually have the face floating in a big field of transparent pixels,
 * and the amount of padding differs per file. Rendering them raw makes the faces come
 * out tiny and inconsistently sized.
 *
 * So at load time we scan each image's alpha channel, find the bounding box of the
 * visible pixels, and re-draw just that box onto a square canvas. The result is that
 * every face fills its frame identically — and any new PNG dropped into public/roster/
 * works without hand-cropping.
 *
 * Results are cached in memory (per session) so this runs once per image.
 */

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

/** Pixels below this alpha are treated as empty. Tolerates soft cutout edges. */
const ALPHA_THRESHOLD = 12

/** Breathing room around the face, as a fraction of the trimmed size. */
const PADDING = 0.06

export function trimFace(src: string): Promise<string> {
  const hit = cache.get(src)
  if (hit) return Promise.resolve(hit)

  const pending = inflight.get(src)
  if (pending) return pending

  const job = load(src)
    .then((img) => {
      const trimmed = trim(img, src)
      cache.set(src, trimmed)
      return trimmed
    })
    .catch(() => src) // On any failure, fall back to the original image.
    .finally(() => inflight.delete(src))

  inflight.set(src, job)
  return job
}

/** Synchronous peek — returns the trimmed URL if it's already been computed. */
export function peekTrimmed(src: string): string | undefined {
  return cache.get(src)
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed to load ${src}`))
    img.src = src
  })
}

function trim(img: HTMLImageElement, src: string): string {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return src

  const scan = document.createElement('canvas')
  scan.width = w
  scan.height = h
  const sctx = scan.getContext('2d', { willReadFrequently: true })
  if (!sctx) return src
  sctx.drawImage(img, 0, 0)

  const { data } = sctx.getImageData(0, 0, w, h)

  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // Fully transparent, or fully opaque with no background to trim — use as-is.
  if (maxX < 0) return src

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1

  // Square it off around the face's centre so portraits and landscapes both sit right.
  const side = Math.max(bw, bh) * (1 + PADDING * 2)
  const cx = minX + bw / 2
  const cy = minY + bh / 2

  const out = document.createElement('canvas')
  out.width = Math.round(side)
  out.height = Math.round(side)
  const octx = out.getContext('2d')
  if (!octx) return src

  octx.drawImage(img, Math.round(cx - side / 2), Math.round(cy - side / 2), Math.round(side), Math.round(side), 0, 0, out.width, out.height)

  return out.toDataURL('image/png')
}

/** Warm the cache for the whole roster up front, so reveals never pop. */
export async function preloadFaces(srcs: string[]): Promise<void> {
  await Promise.all(srcs.map((s) => trimFace(s)))
}
