import type { EvalResult } from '../math/evaluator'

interface Props {
  evalResult: EvalResult | null
  normalized: string | null
  status: 'idle' | 'recognized' | 'rejected' | 'empty'
}

export function ResultDisplay({ evalResult, normalized, status }: Props) {
  if (status === 'idle' || status === 'empty') {
    return <div className="result-display result-idle">Write an expression ending with =</div>
  }

  if (status === 'rejected') {
    return <div className="result-display result-error">Could not recognize expression</div>
  }

  if (!evalResult) return null

  if (!evalResult.ok) {
    const msg = evalResult.error === 'division_by_zero' ? 'Undefined (÷ 0)' :
                evalResult.error === 'empty' ? '' : 'Invalid expression'
    return <div className="result-display result-error">{msg}</div>
  }

  const display = formatNumber(evalResult.value)
  return (
    <div className="result-display result-ok">
      <span className="result-expression">{normalized} </span>
      <span className="result-value">{display}</span>
    </div>
  )
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return 'Undefined'
  const s = n.toString()
  // avoid very long floating-point tails
  if (s.includes('.') && s.split('.')[1].length > 10) {
    return parseFloat(n.toPrecision(12)).toString()
  }
  return s
}
