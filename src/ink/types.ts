export interface Point {
  x: number
  y: number
  pressure?: number
}

export interface Stroke {
  id: string
  points: Point[]
  width: number
  color: string
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export function strokesBoundingBox(strokes: Stroke[], padding = 16): BoundingBox | null {
  if (strokes.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}
