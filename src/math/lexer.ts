export type TokenKind =
  | 'number'
  | 'plus'
  | 'minus'
  | 'mul'
  | 'div'
  | 'equals'
  | 'eof'

export interface Token {
  kind: TokenKind
  value?: number
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const s = input.trim()

  while (i < s.length) {
    const ch = s[i]

    if (ch === ' ' || ch === '\t') { i++; continue }

    if (ch === '+') { tokens.push({ kind: 'plus' }); i++; continue }
    if (ch === '-') { tokens.push({ kind: 'minus' }); i++; continue }
    if (ch === '*' || ch === '×' || ch === '·') { tokens.push({ kind: 'mul' }); i++; continue }
    if (ch === '/' || ch === '÷') { tokens.push({ kind: 'div' }); i++; continue }
    if (ch === '=') { tokens.push({ kind: 'equals' }); i++; continue }

    if (ch >= '0' && ch <= '9' || ch === '.') {
      let num = ''
      while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) {
        num += s[i++]
      }
      const parsed = parseFloat(num)
      if (isNaN(parsed)) throw new Error(`Invalid number: ${num}`)
      tokens.push({ kind: 'number', value: parsed })
      continue
    }

    throw new Error(`Unexpected character: ${ch}`)
  }

  tokens.push({ kind: 'eof' })
  return tokens
}
