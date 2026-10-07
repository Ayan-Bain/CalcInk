import { useEffect, useRef, useState } from 'react'
import { BENCHMARK_CASES, type BenchmarkCase } from './expressions'
import { renderExpressionToStrokes } from './renderExpression'
import type { StrokeData } from '../recognition/protocol'
import { normalizeLatex } from '../recognition/latexNormalizer'
import { evaluate } from '../math/evaluator'
import './BenchmarkPage.css'

interface RunResult {
  caseId: string
  rawLatex: string
  normalizedOutput: string | null
  evalValue: number | 'undefined' | null
  evalMatch: boolean
  normalizationOk: boolean
  latencyMs: number
  error?: string
}

interface WorkerBridge {
  recognize: (strokes: StrokeData[]) => Promise<{ latex: string; latencyMs: number }>
  ready: boolean
  error: string | null
  status: string
}

function makeWorkerBridge(): WorkerBridge {
  const w = new Worker(new URL('../recognition/worker.ts', import.meta.url), { type: 'module' })
  let seq = 0
  const pending = new Map<number, { resolve: (v: { latex: string; latencyMs: number }) => void; reject: (e: Error) => void; t0: number }>()
  let _ready = false
  let _error: string | null = null
  let _status = 'Loading handwriting model…'

  w.onmessage = (e) => {
    const msg = e.data
    if (msg.type === 'ready') { _ready = true; return }
    if (msg.type === 'loading') { _status = msg.message; return }
    if (msg.type === 'init-error') { _error = msg.message; return }
    if (msg.type === 'result') {
      const p = pending.get(msg.id)
      if (p) { p.resolve({ latex: msg.latex, latencyMs: performance.now() - p.t0 }); pending.delete(msg.id) }
    }
    if (msg.type === 'error') {
      const p = pending.get(msg.id)
      if (p) { p.reject(new Error(msg.message)); pending.delete(msg.id) }
    }
  }

  w.postMessage({ type: 'init' })

  return {
    get ready() { return _ready },
    get error() { return _error },
    get status() { return _status },
    recognize(strokes: StrokeData[]) {
      const id = ++seq
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, t0: performance.now() })
        w.postMessage({ type: 'recognize', id, strokes })
      })
    },
  }
}

export default function BenchmarkPage() {
  const bridgeRef = useRef<WorkerBridge | null>(null)
  const [workerReady, setWorkerReady] = useState(false)
  const [workerError, setWorkerError] = useState<string | null>(null)
  const [workerStatus, setWorkerStatus] = useState('Loading handwriting model…')
  const [results, setResults] = useState<RunResult[]>([])
  const [running, setRunning] = useState(false)
  const [currentCase, setCurrentCase] = useState<string | null>(null)

  useEffect(() => {
    const bridge = makeWorkerBridge()
    bridgeRef.current = bridge
    const interval = setInterval(() => {
      setWorkerStatus(bridge.status)
      if (bridge.ready) { setWorkerReady(true); clearInterval(interval) }
      if (bridge.error) { setWorkerError(bridge.error); clearInterval(interval) }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  async function runAll() {
    if (!bridgeRef.current?.ready) return
    setRunning(true)
    setResults([])
    const all: RunResult[] = []

    for (const bc of BENCHMARK_CASES) {
      setCurrentCase(bc.id)
      const result = await runCase(bc)
      all.push(result)
      setResults([...all])
    }

    setCurrentCase(null)
    setRunning(false)
  }

  async function runCase(bc: BenchmarkCase): Promise<RunResult> {
    const strokes = renderExpressionToStrokes(bc.display)
    try {
      const { latex, latencyMs } = await bridgeRef.current!.recognize(strokes)
      const normalized = normalizeLatex(latex)
      let evalValue: number | 'undefined' | null = null
      let evalMatch = false

      if (normalized) {
        const res = evaluate(normalized)
        if (!res.ok && res.error === 'division_by_zero') {
          evalValue = 'undefined'
          evalMatch = bc.expectedValue === 'undefined'
        } else if (res.ok) {
          evalValue = res.value
          if (bc.expectedValue !== 'undefined') {
            evalMatch = Math.abs(res.value - (bc.expectedValue as number)) < 0.001
          }
        }
      }

      return {
        caseId: bc.id,
        rawLatex: latex,
        normalizedOutput: normalized,
        evalValue,
        evalMatch,
        normalizationOk: normalized !== null,
        latencyMs,
      }
    } catch (e: any) {
      return {
        caseId: bc.id,
        rawLatex: '',
        normalizedOutput: null,
        evalValue: null,
        evalMatch: false,
        normalizationOk: false,
        latencyMs: 0,
        error: String(e),
      }
    }
  }

  const correct = results.filter(r => r.evalMatch).length
  const normalized = results.filter(r => r.normalizationOk).length
  const avgLatency = results.length
    ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
    : 0

  return (
    <div className="benchmark">
      <h2>Stage 6 — Recognition Benchmark</h2>
      <p className="bench-subtitle">
        Model: CoMER INT8 · Input: typeset sanity cases (handwriting accuracy not yet measured)
      </p>

      <div className="bench-controls">
        <button onClick={runAll} disabled={!workerReady || running} className="run-btn">
          {workerError ? 'Model failed to load' : !workerReady ? workerStatus : running ? `Running (${currentCase})…` : 'Run All Benchmarks'}
        </button>
        {workerError && <p className="fail">Model load failed: {workerError}</p>}
        {results.length > 0 && (
          <div className="bench-summary">
            Correct: <strong>{correct}/{results.length}</strong> ·
            Normalized: <strong>{normalized}/{results.length}</strong> ·
            Avg latency: <strong>{avgLatency} ms</strong>
          </div>
        )}
      </div>

      <table className="bench-table">
        <thead>
          <tr>
            <th>Expression</th>
            <th>Expected</th>
            <th>Raw LaTeX</th>
            <th>Normalized</th>
            <th>Result</th>
            <th>Match</th>
            <th>ms</th>
          </tr>
        </thead>
        <tbody>
          {BENCHMARK_CASES.map(bc => {
            const r = results.find(x => x.caseId === bc.id)
            const isCurrent = currentCase === bc.id
            return (
              <tr key={bc.id} className={isCurrent ? 'current' : ''}>
                <td className="expr-cell">{bc.display}</td>
                <td className="expected-cell">
                  {bc.expectedValue === 'undefined' ? 'Undefined' : bc.expectedValue}
                </td>
                <td className="latex-cell">{r ? (r.rawLatex || '—') : '—'}</td>
                <td className="norm-cell">
                  {r ? (r.normalizedOutput ?? <span className="fail">rejected</span>) : '—'}
                </td>
                <td className="value-cell">
                  {r ? (r.evalValue === 'undefined' ? 'Undefined' : r.evalValue ?? '—') : '—'}
                </td>
                <td className="match-cell">
                  {r ? (r.evalMatch ? '✓' : '✗') : '—'}
                </td>
                <td className="latency-cell">{r ? `${r.latencyMs.toFixed(0)}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {results.length === BENCHMARK_CASES.length && (
        <div className="bench-decision">
          <strong>Decision:</strong>{' '}
          {correct >= 7
            ? 'TrOCR-LaTeX passes the typeset sanity gate; validate against handwritten samples before claiming handwriting accuracy.'
            : 'TrOCR-LaTeX did not pass the typeset sanity gate; inspect the outputs and validate with labeled handwriting samples.'}
        </div>
      )}
    </div>
  )
}
