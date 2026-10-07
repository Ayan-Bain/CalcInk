// Preprocessing pipeline matching RapidLatexOCR Python implementation.
// mean=0.7931, std=0.1738 (single-channel grayscale)

const MEAN = 0.7931 * 255  // 202.24
const STD  = 0.1738 * 255  // 44.32

const MAX_W = 672
const MAX_H = 192
const MIN_W = 32
const MIN_H = 32
const DIV   = 32   // pad to multiples of this

// ---- public API ----

export interface PreprocessResult {
  tensor: Float32Array  // [1, 1, H, W]
  height: number
  width: number
}

/**
 * Full preprocessing pipeline:
 *   ImageData (RGBA) → crop/pad → minmax size → grayscale → normalize → [1,1,H,W]
 */
export function preprocessImage(imageData: ImageData): PreprocessResult {
  const { gray, width: gw, height: gh } = rgbaToGray(imageData)
  const { gray: cropped, width: cw, height: ch } = autoCropAndPad(gray, gw, gh)
  const { gray: sized, width: sw, height: sh } = minmaxSize(cropped, cw, ch, MAX_W, MAX_H, MIN_W, MIN_H)
  const { gray: padded, width: pw, height: ph } = padToDivisible(sized, sw, sh, DIV)
  const tensor = normalizeToTensor(padded, pw, ph)
  return { tensor, width: pw, height: ph }
}

/**
 * Resize image to a new width, keeping height proportional (or specified).
 */
export function resizeGray(
  gray: Float32Array, srcW: number, srcH: number,
  dstW: number, dstH: number
): Float32Array {
  const out = new Float32Array(dstW * dstH)
  const xScale = srcW / dstW
  const yScale = srcH / dstH
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(Math.floor(x * xScale), srcW - 1)
      const sy = Math.min(Math.floor(y * yScale), srcH - 1)
      out[y * dstW + x] = gray[sy * srcW + sx]
    }
  }
  return out
}

export function preprocessResized(
  gray: Float32Array, w: number, h: number
): PreprocessResult {
  const { gray: sized, width: sw, height: sh } = minmaxSize(gray, w, h, MAX_W, MAX_H, MIN_W, MIN_H)
  const { gray: padded, width: pw, height: ph } = padToDivisible(sized, sw, sh, DIV)
  const tensor = normalizeToTensor(padded, pw, ph)
  return { tensor, width: pw, height: ph }
}

// ---- internals ----

function rgbaToGray(img: ImageData): { gray: Float32Array; width: number; height: number } {
  const { width: w, height: h, data } = img
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    // luminance (white background, dark ink)
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return { gray, width: w, height: h }
}

function autoCropAndPad(
  gray: Float32Array, w: number, h: number
): { gray: Float32Array; width: number; height: number } {
  // Find bounding box of dark pixels (ink)
  const threshold = 200  // pixels darker than this are "ink"
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] < threshold) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) {
    // No ink found — return minimal image
    const out = new Float32Array(DIV * DIV).fill(255)
    return { gray: out, width: DIV, height: DIV }
  }

  // Crop to bounding box
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const cropped = new Float32Array(cw * ch)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      cropped[y * cw + x] = gray[(minY + y) * w + (minX + x)]
    }
  }

  // Pad to multiples of DIV
  return padToDivisible(cropped, cw, ch, DIV)
}

function padToDivisible(
  gray: Float32Array, w: number, h: number, div: number
): { gray: Float32Array; width: number; height: number } {
  const pw = Math.ceil(w / div) * div
  const ph = Math.ceil(h / div) * div
  if (pw === w && ph === h) return { gray, width: w, height: h }
  const out = new Float32Array(pw * ph).fill(255)
  for (let y = 0; y < h; y++) {
    out.set(gray.subarray(y * w, y * w + w), y * pw)
  }
  return { gray: out, width: pw, height: ph }
}

function minmaxSize(
  gray: Float32Array, w: number, h: number,
  maxW: number, maxH: number, minW: number, minH: number
): { gray: Float32Array; width: number; height: number } {
  let nw = w, nh = h

  // Scale down if exceeds max
  const ratioW = nw / maxW, ratioH = nh / maxH
  if (ratioW > 1 || ratioH > 1) {
    const ratio = Math.max(ratioW, ratioH)
    nw = Math.max(1, Math.floor(nw / ratio))
    nh = Math.max(1, Math.floor(nh / ratio))
  }

  // Pad up to min
  nw = Math.max(nw, minW)
  nh = Math.max(nh, minH)

  if (nw === w && nh === h) return { gray, width: w, height: h }

  // Resize if shrank
  let resized = gray
  if (nw !== w || nh !== h) {
    resized = resizeGray(gray, w, h, Math.min(nw, w), Math.min(nh, h))
  }

  // Pad if grew
  if (nw > resized.length / nh || nh > resized.length / nw) {
    const padded = new Float32Array(nw * nh).fill(255)
    const rw = Math.min(nw, w), rh = Math.min(nh, h)
    for (let y = 0; y < rh; y++) padded.set(resized.subarray(y * rw, y * rw + rw), y * nw)
    return { gray: padded, width: nw, height: nh }
  }

  return { gray: resized, width: nw, height: nh }
}

function normalizeToTensor(gray: Float32Array, w: number, h: number): Float32Array {
  const tensor = new Float32Array(w * h)
  for (let i = 0; i < tensor.length; i++) {
    tensor[i] = (gray[i] - MEAN) / STD
  }
  return tensor  // caller wraps in [1,1,H,W]
}
