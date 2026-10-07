import { describe, it, expect } from 'vitest'
import { evaluate } from '../math/evaluator'

describe('evaluator', () => {
  it('basic addition', () => {
    expect(evaluate('18+4')).toEqual({ ok: true, value: 22 })
  })

  it('respects BODMAS — multiply before add', () => {
    expect(evaluate('18+4*3')).toEqual({ ok: true, value: 30 })
  })

  it('respects BODMAS — multiply before subtract', () => {
    expect(evaluate('100-25*2')).toEqual({ ok: true, value: 50 })
  })

  it('decimal arithmetic', () => {
    const r = evaluate('12.5/2')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(6.25)
  })

  it('negative number unary minus', () => {
    expect(evaluate('-5+12')).toEqual({ ok: true, value: 7 })
  })

  it('chained operations', () => {
    const r = evaluate('18+4*3-2.5')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(27.5)
  })

  it('decimal division', () => {
    const r = evaluate('100.0/4-7.25')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(17.75)
  })

  it('division by zero', () => {
    expect(evaluate('8/0')).toEqual({ ok: false, error: 'division_by_zero' })
  })

  it('empty input', () => {
    expect(evaluate('')).toEqual({ ok: false, error: 'empty' })
  })

  it('strips trailing equals', () => {
    expect(evaluate('3+4=')).toEqual({ ok: true, value: 7 })
  })

  it('pi × 2', () => {
    const r = evaluate('3.14*2')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(6.28)
  })
})
