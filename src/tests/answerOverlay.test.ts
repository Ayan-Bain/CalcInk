import { describe, it, expect } from 'vitest'
import { deriveOverlay, formatNumber, placeAnswers } from '../canvas/answerOverlay'
import type { RecognitionResult, ExpressionResult } from '../recognition/RecognitionManager'
import type { Stroke } from '../ink/types'

const GREEN = '#2d6a4f'
const RED = '#c1121f'

describe('formatNumber', () => {
  it('formats integers plainly', () => {
    expect(formatNumber(5)).toBe('5')
  })
  it('trims excessive decimals', () => {
    expect(formatNumber(1 / 3)).toBe('0.333333333333')
  })
  it('returns Undefined for non-finite', () => {
    expect(formatNumber(Infinity)).toBe('Undefined')
  })
})

describe('deriveOverlay', () => {
  it('returns null for null / empty', () => {
    expect(deriveOverlay(null)).toBeNull()
    expect(deriveOverlay({ status: 'empty' })).toBeNull()
  })

  it('draws the value in green when recognized', () => {
    const rec: RecognitionResult = { status: 'recognized', normalized: '2+3=', eval: { ok: true, value: 5 } }
    expect(deriveOverlay(rec)).toEqual({ text: '5', color: GREEN })
  })

  it('draws Undefined in red for division by zero', () => {
    const rec: RecognitionResult = { status: 'recognized', normalized: '5/0=', eval: { ok: false, error: 'division_by_zero' } }
    expect(deriveOverlay(rec)).toEqual({ text: 'Undefined', color: RED })
  })

  it('draws a red ? for rejected input', () => {
    expect(deriveOverlay({ status: 'rejected', reason: 'unsupported' })).toEqual({ text: '?', color: RED })
  })

  it('draws a red ? for a syntax error', () => {
    const rec: RecognitionResult = { status: 'recognized', normalized: '++', eval: { ok: false, error: 'syntax_error' } }
    expect(deriveOverlay(rec)).toEqual({ text: '?', color: RED })
  })

  it('returns null for an empty eval', () => {
    const rec: RecognitionResult = { status: 'recognized', normalized: '=', eval: { ok: false, error: 'empty' } }
    expect(deriveOverlay(rec)).toBeNull()
  })
})

// A stroke occupying a rectangle at a known row.
function box(id: string, y: number, x = 0): Stroke {
  return { id, points: [{ x, y }, { x: x + 20, y: y + 20 }], width: 3, color: '#000' }
}

function recognized(ids: string[], value: number): ExpressionResult {
  return {
    box: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
    result: { status: 'recognized', normalized: '', eval: { ok: true, value } },
    strokeIds: [...ids].sort(),
  }
}

describe('placeAnswers (stable per-expression)', () => {
  it('shows an answer for an unchanged expression', () => {
    const strokes = [box('a', 0), box('b', 0, 40)]
    const placed = placeAnswers(strokes, [recognized(['a', 'b'], 5)])
    expect(placed.map(p => p.overlay.text)).toEqual(['5'])
  })

  it('keeps untouched expressions while a different line is edited', () => {
    // line 1 = a,b (unchanged); line 2 = c,d edited into c,d,e
    const strokes = [box('a', 0), box('b', 0, 40), box('c', 300), box('d', 300, 40), box('e', 300, 80)]
    const results = [recognized(['a', 'b'], 5), recognized(['c', 'd'], 9)]
    const placed = placeAnswers(strokes, results)
    // line 1 keeps its answer; line 2 (now c,d,e) no longer matches → hidden
    expect(placed.map(p => p.overlay.text)).toEqual(['5'])
  })

  it('hides the answer for an expression whose strokes changed', () => {
    const strokes = [box('a', 0), box('b', 0, 40), box('x', 0, 80)] // was a,b, now a,b,x
    const placed = placeAnswers(strokes, [recognized(['a', 'b'], 5)])
    expect(placed).toEqual([])
  })
})
