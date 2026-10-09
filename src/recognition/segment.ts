import type { Stroke } from '../ink/types'

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Stable identity for a group of strokes: its sorted set of ids. */
export function groupKey(ids: readonly string[]): string {
  return [...ids].sort().join(',')
}

export function boundsOf(strokes: readonly Stroke[]): BBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

/**
 * Group strokes into separate expressions by horizontal line (row).
 *
 * Each stroke's vertical span is treated as an interval; intervals are merged
 * top-to-bottom while they overlap (within a tolerance derived from the typical
 * character height), so strokes on the same line stay together and a clear
 * vertical gap starts a new expression. Within each line, strokes keep their
 * original draw order.
 */
export function groupStrokesByLine(strokes: readonly Stroke[]): Stroke[][] {
  const withBounds = strokes
    .map(s => ({ s, b: boundsOf([s]) }))
    .filter((x): x is { s: Stroke; b: BBox } => x.b !== null)
  if (withBounds.length === 0) return []

  // Approximate character height from the median stroke height.
  const heights = withBounds.map(x => x.b.maxY - x.b.minY).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] || 0
  const tol = Math.max(16, medianHeight * 0.6)

  // Sort by vertical position, then merge overlapping intervals into lines.
  const sorted = [...withBounds].sort((a, b) => a.b.minY - b.b.minY)
  const lines: { minY: number; maxY: number; items: { s: Stroke; b: BBox }[] }[] = []
  for (const item of sorted) {
    const cur = lines[lines.length - 1]
    if (cur && item.b.minY <= cur.maxY + tol) {
      cur.maxY = Math.max(cur.maxY, item.b.maxY)
      cur.items.push(item)
    } else {
      lines.push({ minY: item.b.minY, maxY: item.b.maxY, items: [item] })
    }
  }

  // Restore original draw order within each line (stable recognition input).
  const order = new Map(strokes.map((s, i) => [s.id, i]))
  return lines.map(line =>
    line.items
      .map(x => x.s)
      .sort((a, b) => (order.get(a.id)! - order.get(b.id)!)),
  )
}
