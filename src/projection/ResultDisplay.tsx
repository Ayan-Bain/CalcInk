import type { EvalResult } from '../math/evaluator'

interface Props {
  evalResult: EvalResult | null
  normalized: string | null
  status: 'idle' | 'recognized' | 'rejected' | 'empty'
}

export function ResultDisplay({ evalResult, normalized, status }: Props) {
  if (status === 'idle') {
    return (
      <div className="result-display result-idle">
        Write an arithmetic expression ending with <span className="result-hint-eq">=</span>
      </div>
    )
  }

  if (status === 'empty') {
    return <div className="result-display result-idle">Keep writing…</div>
  }

  if (status === 'rejected') {
    return <div className="result-display result-error">Expression not recognized</div>
  }

  if (!evalResult) return null

  if (!evalResult.ok) {
    if (evalResult.error === 'division_by_zero') {
      return (
        <div className="result-display result-ok">
          <span className="result-expression">{normalized}</span>
          <span className="result-equals">=</span>
          <span className="result-value result-undefined">Undefined</span>
        </div>
      )
    }
    if (evalResult.error === 'empty') return <div className="result-display result-idle">Keep writing…</div>
    return <div className="result-display result-error">Invalid expression</div>
  }

  return (
    <div className="result-display result-ok">
      <span className="result-expression">{normalized?.replace(/=$/, '')}</span>
      <span className="result-equals">=</span>
      <span className="result-value">{formatNumber(evalResult.value)}</span>
    </div>
  )
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return 'Undefined'
  const s = n.toString()
  if (s.includes('.') && s.split('.')[1].length > 10) {
    return parseFloat(n.toPrecision(12)).toString()
  }
  return s
}
