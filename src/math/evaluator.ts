import type { ASTNode } from './ast'
import { parse } from './parser'

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: 'division_by_zero' | 'syntax_error' | 'empty' }

function evalNode(node: ASTNode): number {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'unary':
      return -evalNode(node.operand)
    case 'binary': {
      const l = evalNode(node.left)
      const r = evalNode(node.right)
      switch (node.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/':
          if (r === 0) throw { isDivByZero: true }
          return l / r
      }
    }
  }
}

export function evaluate(expression: string): EvalResult {
  const trimmed = expression.replace(/=\s*$/, '').trim()
  if (!trimmed) return { ok: false, error: 'empty' }
  try {
    const ast = parse(trimmed)
    const value = evalNode(ast)
    return { ok: true, value }
  } catch (e: any) {
    if (e?.isDivByZero) return { ok: false, error: 'division_by_zero' }
    return { ok: false, error: 'syntax_error' }
  }
}
