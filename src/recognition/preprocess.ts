// CoMER preprocessing: stroke data → tensor + mask for the ONNX encoder.
// Renders using CROHME convention (white ink on black bg) with Bézier curves.
// Adapted from kimseungdae/ink-on (MIT)

export interface StrokeData {
  points: { x: number; y: number }[]
  lineWidth: number
}

export interface PreprocessResult {
  tensor: Float32Array  // [1, 1, MODEL_H, width] grayscale 0–1
  height: number        // MODEL_H = 256
  width: number         // dynamic, aligned to W_ALIGN
  mask: Uint8Array      // [MODEL_H × width] — 0=content, 1=padding
  maskHeight: number
  maskWidth: number
}

const MODEL_H = 256
const MAX_W = 1024
const MIN_W = 128
const W_ALIGN = 64
const TARGET_H = 128  // scale content to CROHME training height
const PAD = 16

function resamplePoints(
  points: { x: number; y: number }[],
  interval = 3,
): { x: number; y: number }[] {
  if (points.length < 2) return points
  const out: { x: number; y: number }[] = [points[0]!]
  let remaining = interval
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    const dx = curr.x - prev.x
    const dy = curr.y - prev.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= remaining) { remaining -= dist; continue }
    let covered = remaining
    while (covered <= dist) {
      const t = covered / dist
      out.push({ x: prev.x + dx * t, y: prev.y + dy * t })
      covered += interval
    }
    remaining = covered - dist
  }
  out.push(points[points.length - 1]!)
  return out
}

function computeBBox(strokes: StrokeData[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of strokes)
    for (const p of s.points) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
    }
  return { minX, minY, maxX, maxY }
}

function renderStrokes(strokes: StrokeData[]): OffscreenCanvas {
  const bbox = computeBBox(strokes)
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.ceil(bbox.maxX - bbox.minX)) + PAD * 2,
    Math.max(1, Math.ceil(bbox.maxY - bbox.minY)) + PAD * 2,
  )
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    const pts = resamplePoints(stroke.points)
    ctx.lineWidth = Math.max(2, stroke.lineWidth)
    ctx.beginPath()
    const ox = -bbox.minX + PAD
    const oy = -bbox.minY + PAD
    ctx.moveTo(pts[0]!.x + ox, pts[0]!.y + oy)
    if (pts.length === 2) {
      ctx.lineTo(pts[1]!.x + ox, pts[1]!.y + oy)
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(
          pts[i]!.x + ox, pts[i]!.y + oy,
          (pts[i]!.x + pts[i + 1]!.x) / 2 + ox,
          (pts[i]!.y + pts[i + 1]!.y) / 2 + oy,
        )
      }
      ctx.lineTo(pts[pts.length - 1]!.x + ox, pts[pts.length - 1]!.y + oy)
    }
    ctx.stroke()
  }
  return canvas
}

function scaleToFit(src: OffscreenCanvas) {
  const scale = Math.min(TARGET_H / src.height, MAX_W / src.width)
  const dw = Math.max(1, Math.round(src.width * scale))
  const dh = Math.max(1, Math.round(src.height * scale))
  const canvasW = Math.min(MAX_W, Math.max(MIN_W, Math.ceil((dw + PAD) / W_ALIGN) * W_ALIGN))
  const target = new OffscreenCanvas(canvasW, MODEL_H)
  const ctx = target.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasW, MODEL_H)
  // top-left aligned (CROHME convention)
  ctx.drawImage(src, 0, 0, dw, dh)
  return { canvas: target, contentH: dh, contentW: dw, canvasW }
}

export function preprocessStrokes(strokes: StrokeData[]): PreprocessResult {
  const rawCanvas = renderStrokes(strokes)
  const { canvas, contentH, contentW, canvasW } = scaleToFit(rawCanvas)

  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvasW, MODEL_H)
  const pixels = canvasW * MODEL_H
  const tensor = new Float32Array(pixels)
  for (let i = 0; i < pixels; i++) {
    const o = i * 4
    tensor[i] = (data[o]! * 0.299 + data[o + 1]! * 0.587 + data[o + 2]! * 0.114) / 255
  }

  const mask = new Uint8Array(MODEL_H * canvasW)
  for (let y = 0; y < MODEL_H; y++)
    for (let x = 0; x < canvasW; x++)
      mask[y * canvasW + x] = y < contentH && x < contentW ? 0 : 1

  return { tensor, height: MODEL_H, width: canvasW, mask, maskHeight: MODEL_H, maskWidth: canvasW }
}
