import type { Stroke } from '../ink/types'
import type { PlacedAnswer } from './answerOverlay'

export type CanvasBackground = 'ruled' | 'graph' | 'blank'

export interface CanvasTheme {
  ink: string
  bg: string
  ruled: string
  graph: string
}

export const LIGHT_THEME: CanvasTheme = { ink: '#1a1a2e', bg: '#ffffff', ruled: '#e8e0d0', graph: '#d6e3f0' }
export const DARK_THEME: CanvasTheme = { ink: '#f5f5f5', bg: '#16171d', ruled: '#2c2e38', graph: '#2a3a4d' }

const GRID = 32

/** Fill the canvas with the chosen paper background (opaque base + optional lines). */
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: CanvasBackground,
  theme: CanvasTheme = LIGHT_THEME,
): void {
  ctx.save()
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, width, height)

  if (background !== 'blank') {
    ctx.strokeStyle = background === 'graph' ? theme.graph : theme.ruled
    ctx.lineWidth = 1
    ctx.beginPath()
    // horizontal rules (both styles)
    for (let y = GRID; y < height; y += GRID) {
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(width, y + 0.5)
    }
    // vertical rules (graph only)
    if (background === 'graph') {
      for (let x = GRID; x < width; x += GRID) {
        ctx.moveTo(x + 0.5, 0)
        ctx.lineTo(x + 0.5, height)
      }
    }
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Draw the strokes themselves in the theme's ink color (so the single app ink
 * follows the theme — e.g. turns white in dark mode). Caller sets up the transform.
 */
export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[], ink: string): void {
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    ctx.beginPath()
    ctx.strokeStyle = ink
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const [first, ...rest] = stroke.points
    ctx.moveTo(first.x, first.y)

    if (rest.length === 0) {
      ctx.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2)
      ctx.fillStyle = ink
      ctx.fill()
    } else {
      for (const pt of rest) ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
    }
  }
}

/** Draw each computed answer just to the right of its expression, vertically centered. */
export function paintAnswers(ctx: CanvasRenderingContext2D, answers: readonly PlacedAnswer[]): void {
  const gap = 16
  for (const { box, overlay } of answers) {
    const fontSize = Math.min(72, Math.max(28, box.maxY - box.minY))
    ctx.save()
    ctx.fillStyle = overlay.color
    ctx.font = `${fontSize}px 'Patrick Hand', 'Comic Sans MS', cursive`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(overlay.text, box.maxX + gap, (box.minY + box.maxY) / 2)
    ctx.restore()
  }
}

export function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  width: number,
  height: number,
  dpr: number,
  answers: readonly PlacedAnswer[] = [],
  background: CanvasBackground = 'ruled',
  theme: CanvasTheme = LIGHT_THEME,
): void {
  ctx.save()
  ctx.clearRect(0, 0, width * dpr, height * dpr)
  ctx.scale(dpr, dpr)
  paintBackground(ctx, width, height, background, theme)
  paintStrokes(ctx, strokes, theme.ink)
  paintAnswers(ctx, answers)
  ctx.restore()
}

/** Render background + strokes + answers onto a canvas and trigger a PNG download. */
export function exportCanvasPng(
  strokes: readonly Stroke[],
  answers: readonly PlacedAnswer[],
  width: number,
  height: number,
  dpr: number,
  background: CanvasBackground = 'ruled',
  theme: CanvasTheme = LIGHT_THEME,
  filename = 'calcink.png',
): void {
  const offscreen = document.createElement('canvas')
  offscreen.width = width * dpr
  offscreen.height = height * dpr
  const ctx = offscreen.getContext('2d')
  if (!ctx) return

  ctx.scale(dpr, dpr)
  paintBackground(ctx, width, height, background, theme)
  paintStrokes(ctx, strokes, theme.ink)
  paintAnswers(ctx, answers)

  const url = offscreen.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
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
