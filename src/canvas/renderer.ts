import type { Stroke } from '../ink/types'

export function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  width: number,
  height: number,
  dpr: number,
): void {
  ctx.save()
  ctx.clearRect(0, 0, width * dpr, height * dpr)
  ctx.scale(dpr, dpr)

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    ctx.beginPath()
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const [first, ...rest] = stroke.points
    ctx.moveTo(first.x, first.y)

    if (rest.length === 0) {
      ctx.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2)
      ctx.fillStyle = stroke.color
      ctx.fill()
    } else {
      for (const pt of rest) ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
    }
  }

  ctx.restore()
}

export function rasterizeCrop(
  strokes: readonly Stroke[],
  box: { x: number; y: number; width: number; height: number },
  targetWidth: number,
  targetHeight: number,
  bgColor = '#ffffff',
): ImageData {
  const offscreen = document.createElement('canvas')
  offscreen.width = targetWidth
  offscreen.height = targetHeight
  const ctx = offscreen.getContext('2d')!
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  const scaleX = targetWidth / box.width
  const scaleY = targetHeight / box.height

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    ctx.beginPath()
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width * Math.min(scaleX, scaleY)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const [first, ...rest] = stroke.points
    ctx.moveTo((first.x - box.x) * scaleX, (first.y - box.y) * scaleY)
    if (rest.length === 0) {
      ctx.arc(
        (first.x - box.x) * scaleX,
        (first.y - box.y) * scaleY,
        (stroke.width / 2) * Math.min(scaleX, scaleY),
        0, Math.PI * 2
      )
      ctx.fillStyle = stroke.color
      ctx.fill()
    } else {
      for (const pt of rest) ctx.lineTo((pt.x - box.x) * scaleX, (pt.y - box.y) * scaleY)
      ctx.stroke()
    }
  }

  return ctx.getImageData(0, 0, targetWidth, targetHeight)
}
