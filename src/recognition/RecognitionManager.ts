import type { WorkerResponse } from './protocol'
import { normalizeLatex } from './latexNormalizer'
import { evaluate, type EvalResult } from '../math/evaluator'

export type RecognitionResult =
  | { status: 'recognized'; normalized: string; eval: EvalResult }
  | { status: 'rejected'; reason: string }
  | { status: 'empty' }

export type LoadingCallback = (message: string) => void

type ResultCallback = (result: RecognitionResult) => void

export class RecognitionManager {
  private worker: Worker
  private nextId = 1
  private pendingId = 0
  private callback: ResultCallback
  private onLoading?: LoadingCallback
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private debounceMs: number

  constructor(workerUrl: string | URL, callback: ResultCallback, debounceMs = 600, onLoading?: LoadingCallback) {
    this.callback = callback
    this.onLoading = onLoading
    this.debounceMs = debounceMs
    this.worker = new Worker(workerUrl, { type: 'module' })
    this.worker.onmessage = this.handleMessage.bind(this)
    this.worker.postMessage({ type: 'init' })
  }

  scheduleRecognition(imageData: ImageData): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.sendRecognition(imageData)
    }, this.debounceMs)
  }

  private sendRecognition(imageData: ImageData): void {
    const id = this.nextId++
    this.pendingId = id
    this.worker.postMessage({ type: 'recognize', id, imageData })
  }

  private handleMessage(e: MessageEvent<WorkerResponse>): void {
    const msg = e.data
    if (msg.type === 'ready') return
    if (msg.type === 'loading') { this.onLoading?.(msg.message); return }

    if (msg.type === 'result') {
      if (msg.id !== this.pendingId) return  // stale result

      if (!msg.latex) {
        this.callback({ status: 'empty' })
        return
      }
      const normalized = normalizeLatex(msg.latex)
      if (!normalized) {
        this.callback({ status: 'rejected', reason: 'unsupported LaTeX' })
        return
      }
      const evalResult = evaluate(normalized)
      this.callback({ status: 'recognized', normalized, eval: evalResult })
    }

    if (msg.type === 'error') {
      if (msg.id !== this.pendingId) return
      this.callback({ status: 'rejected', reason: msg.message })
    }
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.worker.terminate()
  }
}
