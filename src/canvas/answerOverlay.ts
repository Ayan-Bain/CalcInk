import type { RecognitionResult, ExpressionResult } from '../recognition/RecognitionManager'
import type { Stroke } from '../ink/types'
import { groupStrokesByLine, boundsOf, groupKey } from '../recognition/segment'

// Light mirrors the CSS vars in src/app/App.css (--success / --error);
// dark uses brighter variants for contrast on the dark canvas.
const GREEN = '#2d6a4f'
const RED = '#c1121f'
const GREEN_DARK = '#4ade80'
const RED_DARK = '#f87171'

export interface AnswerOverlay {
  text: string
  color: string
}

/** An answer to draw, together with the ink box it belongs next to. */
export interface PlacedAnswer {
  box: { minX: number; minY: number; maxX: number; maxY: number }
  overlay: AnswerOverlay
}

/**
 * Place answers for the CURRENT strokes, reusing each expression's last known
 * result as long as that expression's set of strokes is unchanged. An expression
 * whose ink was just edited (or is brand new) has no matching prior result, so it
 * shows no answer until the next recognition completes — while untouched
 * expressions keep their answers on screen.
 */
export function placeAnswers(strokes: readonly Stroke[], results: ExpressionResult[], dark = false): PlacedAnswer[] {
  const prevByKey = new Map<string, ExpressionResult>()
  for (const r of results) prevByKey.set(groupKey(r.strokeIds), r)

  const placed: PlacedAnswer[] = []
  for (const group of groupStrokesByLine(strokes)) {
    const prev = prevByKey.get(groupKey(group.map(s => s.id)))
    if (!prev) continue // changed or new — wait for fresh recognition
    const overlay = deriveOverlay(prev.result, dark)
    const box = boundsOf(group)
    if (overlay && box) placed.push({ box, overlay })
  }
  return placed
}

export function formatNumber(n: number): string {
  if (!isFinite(n)) return 'Undefined'
  const s = n.toString()
  if (s.includes('.') && s.split('.')[1].length > 10) {
    return parseFloat(n.toPrecision(12)).toString()
  }
  return s
}

/** What to draw on the canvas (right of the `=`) for a given recognition result. */
export function deriveOverlay(rec: RecognitionResult | null, dark = false): AnswerOverlay | null {
  const green = dark ? GREEN_DARK : GREEN
  const red = dark ? RED_DARK : RED
  if (!rec) return null
  if (rec.status === 'empty') return null
  if (rec.status === 'rejected') return { text: '?', color: red }

  // recognized
  const ev = rec.eval
  if (ev.ok) return { text: formatNumber(ev.value), color: green }
  if (ev.error === 'division_by_zero') return { text: 'Undefined', color: red }
  if (ev.error === 'empty') return null
  return { text: '?', color: red }
}
