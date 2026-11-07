/**
 * Leagues live in localStorage (~5 MB for everything), so an uploaded wallpaper is
 * downscaled and re-encoded as JPEG before it's stored. A phone photo goes from several
 * MB to a few hundred KB, which still looks fine behind a dark tint.
 */
const MAX_EDGE = 1920
const BUDGET = 900_000 // characters of data URL

export async function shrinkWallpaper(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file isn’t an image.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Couldn’t read that image.'))
      i.src = url
    })
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#0d0b12' // transparent PNGs would otherwise turn black-on-black anyway; be explicit
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL('image/jpeg', quality)
      if (data.length <= BUDGET) return data
    }
    throw new Error('That image is too detailed to store. Try a smaller one.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
