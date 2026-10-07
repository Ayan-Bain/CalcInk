import { describe, it, expect } from 'vitest'
import { preprocessImage } from '../recognition/preprocess'

function makeImageData(width: number, height: number, fill = 255): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill; data[i + 1] = fill; data[i + 2] = fill; data[i + 3] = 255
  }
  return { data, width, height, colorSpace: 'srgb' }
}

function makeImageDataWithInk(width: number, height: number): ImageData {
  const img = makeImageData(width, height, 255)
  // Draw a dark horizontal bar in the center
  const cx = Math.floor(width / 2), cy = Math.floor(height / 2)
  for (let x = cx - 20; x < cx + 20; x++) {
    const off = (cy * width + x) * 4
    img.data[off] = 0; img.data[off + 1] = 0; img.data[off + 2] = 0
  }
  return img
}

describe('preprocessImage', () => {
  it('returns a Float32Array of size width * height', () => {
    const img = makeImageDataWithInk(200, 100)
    const { tensor, width, height } = preprocessImage(img)
    expect(tensor.length).toBe(width * height)
  })

  it('output dimensions are multiples of 32', () => {
    const img = makeImageDataWithInk(200, 100)
    const { width, height } = preprocessImage(img)
    expect(width % 32).toBe(0)
    expect(height % 32).toBe(0)
  })

  it('output width does not exceed MAX_W=672', () => {
    const img = makeImageDataWithInk(800, 100)
    const { width } = preprocessImage(img)
    expect(width).toBeLessThanOrEqual(672)
  })

  it('output height does not exceed MAX_H=192', () => {
    const img = makeImageDataWithInk(200, 300)
    const { height } = preprocessImage(img)
    expect(height).toBeLessThanOrEqual(192)
  })

  it('handles blank (all-white) image without throwing', () => {
    const img = makeImageData(200, 100, 255)
    expect(() => preprocessImage(img)).not.toThrow()
  })
})
