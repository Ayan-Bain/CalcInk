// Maps LaTeX tokens to CalcInk arithmetic tokens.
// Returns null if the expression contains unsupported constructs.

const TOKEN_MAP: Record<string, string> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '\\times': '*',
  '\\cdot': '*',
  '\\div': '/',
  '.': '.',
}

const DIGIT_RE = /^[0-9]$/
const REJECT_COMMANDS = new Set([
  '\\frac', '\\sqrt', '\\int', '\\sum', '\\prod', '\\lim',
  '\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\exp',
  '\\alpha', '\\beta', '\\gamma', '\\pi', '\\infty',
  '^', '_', '{', '}', '(', ')',
])

export function normalizeLatex(latex: string): string | null {
  const raw = latex.trim()
  const chars = tokenizeLatex(raw)
  if (chars === null) return null

  const out: string[] = []
  for (const tok of chars) {
    if (tok === '=') {
      // Strip a single trailing '='; if more follow, reject (mid-expression '=' is invalid)
      if (out.length === 0) return null
      out.push('=')
      continue
    }
    if (REJECT_COMMANDS.has(tok)) return null
    const mapped = TOKEN_MAP[tok]
    if (mapped !== undefined) { out.push(mapped); continue }
    if (tok.startsWith('\\')) return null  // unsupported command
    if (DIGIT_RE.test(tok)) { out.push(tok); continue }
    if (/^[a-zA-Z]$/.test(tok)) return null  // variable
    return null
  }

  // Remove trailing '=' (the user's "evaluate this" cue) — reject if '=' appears elsewhere
  let result = out.join('')
  if (result.endsWith('=')) result = result.slice(0, -1)
  if (result.includes('=')) return null
  return result || null
}

function tokenizeLatex(s: string): string[] | null {
  const tokens: string[] = []
  let i = 0
  while (i < s.length) {
    if (s[i] === ' ') { i++; continue }
    if (s[i] === '\\') {
      let cmd = '\\'
      i++
      while (i < s.length && /[a-zA-Z]/.test(s[i])) cmd += s[i++]
      tokens.push(cmd)
    } else {
      tokens.push(s[i++])
    }
  }
  return tokens
}
