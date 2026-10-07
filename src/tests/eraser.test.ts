import { describe, it, expect } from 'vitest'
import { findStrokesNearPoint } from '../canvas/eraser'
import type { Stroke } from '../ink/types'

function seg(id: string, x1: number, y1: number, x2: number, y2: number): Stroke {
  return { id, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], width: 2, color: '#000' }
}

describe('findStrokesNearPoint', () => {
  const strokes = [
    seg('a', 0, 0, 100, 0),   // horizontal at y=0
    seg('b', 0, 50, 100, 50), // horizontal at y=50
  ]

  it('hits stroke a when near y=0', () => {
    const hit = findStrokesNearPoint(strokes, 50, 2, 5)
    expect(hit.has('a')).toBe(true)
    expect(hit.has('b')).toBe(false)
  })

  it('hits stroke b when near y=50', () => {
    const hit = findStrokesNearPoint(strokes, 50, 48, 5)
    expect(hit.has('b')).toBe(true)
  })

  it('hits nothing when far from all strokes', () => {
    const hit = findStrokesNearPoint(strokes, 50, 200, 5)
    expect(hit.size).toBe(0)
  })
})
