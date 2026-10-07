import { describe, it, expect } from 'vitest'
import { normalizeLatex } from '../recognition/latexNormalizer'

describe('latexNormalizer', () => {
  it('passes through plain arithmetic', () => {
    expect(normalizeLatex('18+4')).toBe('18+4')
  })

  it('maps \\times to *', () => {
    expect(normalizeLatex('3\\times4')).toBe('3*4')
  })

  it('maps \\div to /', () => {
    expect(normalizeLatex('12\\div4')).toBe('12/4')
  })

  it('maps unicode minus to -', () => {
    expect(normalizeLatex('5−3')).toBe('5-3')
  })

  it('strips trailing = (user evaluate cue)', () => {
    expect(normalizeLatex('2+2=')).toBe('2+2')
  })

  it('strips trailing = with spaces', () => {
    expect(normalizeLatex('1 + 2 =')).toBe('1+2')
  })

  it('rejects mid-expression =', () => {
    expect(normalizeLatex('1=2+3')).toBeNull()
  })

  it('rejects variables', () => {
    expect(normalizeLatex('x+2')).toBeNull()
  })

  it('rejects \\frac', () => {
    expect(normalizeLatex('\\frac{1}{2}')).toBeNull()
  })

  it('rejects \\sqrt', () => {
    expect(normalizeLatex('\\sqrt{4}')).toBeNull()
  })

  it('rejects powers', () => {
    expect(normalizeLatex('2^3')).toBeNull()
  })

  it('rejects unknown commands', () => {
    expect(normalizeLatex('\\foo')).toBeNull()
  })

  it('handles decimal numbers', () => {
    expect(normalizeLatex('3.14')).toBe('3.14')
  })

  it('handles spaces', () => {
    expect(normalizeLatex('1 + 2')).toBe('1+2')
  })
})
