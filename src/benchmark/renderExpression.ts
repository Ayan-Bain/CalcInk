// Render a math expression string to StrokeData for benchmark inference.
// Renders in CROHME convention (white ink on black) and extracts horizontal
// pixel runs as synthetic strokes — a reasonable typeset sanity proxy.
import type { StrokeData } from '../recognition/protocol'

export function renderExpressionToStrokes(
  text: string,
  width = 512,
  height = 96,
): StrokeData[] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#fff'
  const fontSize = Math.min(height * 0.55, 40)
  ctx.font = `${fontSize}px 'Courier New', monospace`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, width / 2, height / 2)

  const { data } = ctx.getImageData(0, 0, width, height)
  const strokes: StrokeData[] = []

  // Scan each row; each contiguous run of bright pixels → one horizontal stroke
  for (let y = 0; y < height; y++) {
    let runStart = -1
    for (let x = 0; x <= width; x++) {
      const bright = x < width && data[(y * width + x) * 4]! > 64
      if (bright && runStart < 0) {
        runStart = x
      } else if (!bright && runStart >= 0) {
        strokes.push({ points: [{ x: runStart, y }, { x: x - 1, y }], lineWidth: 2 })
        runStart = -1
      }
    }
  }

  return strokes
}
