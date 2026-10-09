import { describe, it, expect } from 'vitest'
import { groupStrokesByLine, boundsOf } from '../recognition/segment'
import type { Stroke } from '../ink/types'

// A stroke occupying a rectangle, used to place ink at known positions.
function box(id: string, x: number, y: number, w = 20, h = 20): Stroke {
  return { id, points: [{ x, y }, { x: x + w, y: y + h }], width: 3, color: '#000' }
}

describe('groupStrokesByLine', () => {
  it('returns no groups for empty input', () => {
    expect(groupStrokesByLine([])).toEqual([])
  })

  it('keeps strokes on the same row in one group', () => {
    const strokes = [box('a', 0, 100), box('b', 40, 105), box('c', 80, 98)]
    const groups = groupStrokesByLine(strokes)
    expect(groups).toHaveLength(1)
    expect(groups[0].map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('splits strokes separated by a clear vertical gap into separate expressions', () => {
    const strokes = [box('a', 0, 0), box('b', 40, 5), box('c', 0, 300), box('d', 40, 305)]
    const groups = groupStrokesByLine(strokes)
    expect(groups).toHaveLength(2)
    expect(groups[0].map(s => s.id).sort()).toEqual(['a', 'b'])
    expect(groups[1].map(s => s.id).sort()).toEqual(['c', 'd'])
  })

  it('preserves original draw order within a line regardless of x position', () => {
    // Drawn right-to-left: c then b then a, all on one row.
    const strokes = [box('c', 80, 0), box('b', 40, 0), box('a', 0, 0)]
    const groups = groupStrokesByLine(strokes)
    expect(groups).toHaveLength(1)
    expect(groups[0].map(s => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('orders groups top-to-bottom', () => {
    const strokes = [box('bottom', 0, 400), box('top', 0, 0)]
    const groups = groupStrokesByLine(strokes)
    expect(groups.map(g => g[0].id)).toEqual(['top', 'bottom'])
  })
})

describe('boundsOf', () => {
  it('returns null when there are no points', () => {
    expect(boundsOf([{ id: 'x', points: [], width: 1, color: '#000' }])).toBeNull()
  })

  it('computes the tight bounding box over all strokes', () => {
    expect(boundsOf([box('a', 10, 20, 30, 40)])).toEqual({ minX: 10, minY: 20, maxX: 40, maxY: 60 })
  })
})
