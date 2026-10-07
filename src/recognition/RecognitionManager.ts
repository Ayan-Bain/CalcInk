import type { WorkerResponse, StrokeData } from './protocol'
import type { Stroke } from '../ink/types'
import { normalizeLatex } from './latexNormalizer'
import { evaluate, type EvalResult } from '../math/evaluator'

export type RecognitionResult =
  | { status: 'recognized'; normalized: string; eval: EvalResult }
  | { status: 'rejected'; reason: string }
  | { status: 'empty' }

export type LoadingCallback = (message: string) => void
export type ReadyCallback = () => void

type ResultCallback = (result: RecognitionResult) => void

export class RecognitionManager {
  private worker: Worker
  private nextId = 1
  private pendingId = 0
  private callback: ResultCallback
  private onLoading?: LoadingCallback
  private onReady?: ReadyCallback
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private debounceMs: number

  constructor(
    workerUrl: string | URL,
    callback: ResultCallback,
    debounceMs = 600,
    onLoading?: LoadingCallback,
    onReady?: ReadyCallback,
  ) {
    this.callback = callback
    this.onLoading = onLoading
    this.onReady = onReady
    this.debounceMs = debounceMs
    this.worker = new Worker(workerUrl, { type: 'module' })
    this.worker.onmessage = this.handleMessage.bind(this)
    this.worker.postMessage({ type: 'init' })
  }

  scheduleRecognition(strokes: Stroke[]): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.sendRecognition(strokes)
    }, this.debounceMs)
  }

  private sendRecognition(strokes: Stroke[]): void {
    const id = this.nextId++
    this.pendingId = id
    const strokeData: StrokeData[] = strokes.map(s => ({
      points: s.points.map(p => ({ x: p.x, y: p.y })),
      lineWidth: s.width,
    }))
    this.worker.postMessage({ type: 'recognize', id, strokes: strokeData })
  }

  private handleMessage(e: MessageEvent<WorkerResponse>): void {
    const msg = e.data
    if (msg.type === 'ready') { this.onReady?.(); return }
    if (msg.type === 'loading') { this.onLoading?.(msg.message); return }
    if (msg.type === 'init-error') { this.onLoading?.(`Model load failed: ${msg.message}`); return }

    if (msg.type === 'result') {
      if (msg.id !== this.pendingId) return

      if (!msg.latex) {
        console.log('[CalcInk] recognition: empty output')
        this.callback({ status: 'empty' })
        return
      }
      const normalized = normalizeLatex(msg.latex)
      console.log(`[CalcInk] raw latex: "${msg.latex}"  →  normalized: ${normalized === null ? 'null (rejected)' : `"${normalized}"`}`)
      if (!normalized) {
        this.callback({ status: 'rejected', reason: 'unsupported LaTeX' })
        return
      }
      const evalResult = evaluate(normalized)
      console.log(`[CalcInk] eval: "${normalized}" =`, evalResult.ok ? evalResult.value : `ERROR(${evalResult.error})`)
      this.callback({ status: 'recognized', normalized, eval: evalResult })
    }

    if (msg.type === 'error') {
      if (msg.id !== this.pendingId) return
      console.warn('[CalcInk] worker error:', msg.message)
      this.callback({ status: 'rejected', reason: msg.message })
    }
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.worker.terminate()
  }
}
