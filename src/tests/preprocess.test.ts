import { describe, it, expect } from 'vitest'
import { preprocessStrokes, type StrokeData } from '../recognition/preprocess'

// OffscreenCanvas is not available in jsdom — provide a minimal stub
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  class FakeContext {
    fillStyle = ''; strokeStyle = ''; lineCap = ''; lineJoin = ''; lineWidth = 0
    fillRect() {} beginPath() {} moveTo() {} lineTo() {} quadraticCurveTo() {} stroke() {}
    drawImage() {}
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }
    }
  }
  class FakeOffscreenCanvas {
    width: number; height: number
    constructor(w: number, h: number) { this.width = w; this.height = h }
    getContext() { return new FakeContext() }
  }
  ;(globalThis as any).OffscreenCanvas = FakeOffscreenCanvas
}

function makeStrokes(n = 3): StrokeData[] {
  return Array.from({ length: n }, (_, i) => ({
    points: [{ x: 10 + i * 30, y: 20 }, { x: 30 + i * 30, y: 50 }, { x: 50 + i * 30, y: 20 }],
    lineWidth: 4,
  }))
}

describe('preprocessStrokes', () => {
  it('returns tensor of size width * height', () => {
    const { tensor, width, height } = preprocessStrokes(makeStrokes())
    expect(tensor.length).toBe(width * height)
  })

  it('height is MODEL_H = 256', () => {
    const { height } = preprocessStrokes(makeStrokes())
    expect(height).toBe(256)
  })

  it('width is aligned to 64 px', () => {
    const { width } = preprocessStrokes(makeStrokes())
    expect(width % 64).toBe(0)
  })

  it('width is within [128, 1024]', () => {
    const { width } = preprocessStrokes(makeStrokes())
    expect(width).toBeGreaterThanOrEqual(128)
    expect(width).toBeLessThanOrEqual(1024)
  })

  it('mask has same number of elements as tensor', () => {
    const { tensor, mask } = preprocessStrokes(makeStrokes())
    expect(mask.length).toBe(tensor.length)
  })

  it('handles a single-point stroke without throwing', () => {
    const strokes: StrokeData[] = [{ points: [{ x: 50, y: 50 }], lineWidth: 4 }]
    expect(() => preprocessStrokes(strokes)).not.toThrow()
  })
})
