import type { Stroke, Point } from '../ink/types'

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

export function findStrokesNearPoint(strokes: readonly Stroke[], x: number, y: number, radius: number): Set<string> {
  const hit = new Set<string>()
  for (const stroke of strokes) {
    const pts = stroke.points
    if (pts.length === 0) continue
    const threshold = radius + stroke.width / 2
    let close = false
    if (pts.length === 1) {
      close = Math.hypot(pts[0].x - x, pts[0].y - y) <= threshold
    } else {
      for (let i = 0; i < pts.length - 1 && !close; i++) {
        close = distPointToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= threshold
      }
    }
    if (close) hit.add(stroke.id)
  }
  return hit
}

export function pixelErase(
  strokes: readonly Stroke[],
  x: number,
  y: number,
  radius: number,
): Stroke[] {
  const result: Stroke[] = []
  for (const stroke of strokes) {
    const segments: Point[][] = []
    let current: Point[] = []
    for (const pt of stroke.points) {
      if (Math.hypot(pt.x - x, pt.y - y) <= radius) {
        if (current.length >= 2) segments.push(current)
        current = []
      } else {
        current.push(pt)
      }
    }
    if (current.length >= 2) segments.push(current)
    for (const seg of segments) {
      result.push({ ...stroke, id: `${stroke.id}_${Math.random().toString(36).slice(2)}`, points: seg })
    }
  }
  return result
}
