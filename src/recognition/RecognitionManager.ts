import type { WorkerResponse, StrokeData } from './protocol'
import type { Stroke } from '../ink/types'
import { normalizeLatex } from './latexNormalizer'
import { evaluate, type EvalResult } from '../math/evaluator'
import { groupStrokesByLine, boundsOf, groupKey, type BBox } from './segment'

export type RecognitionResult =
  | { status: 'recognized'; normalized: string; eval: EvalResult }
  | { status: 'rejected'; reason: string }
  | { status: 'empty' }

/** One recognized expression plus where its ink sits and which strokes formed it. */
export interface ExpressionResult {
  box: BBox
  result: RecognitionResult
  /** Sorted ids of the strokes in this expression — its stable identity. */
  strokeIds: string[]
}

export type LoadingCallback = (message: string) => void
export type ReadyCallback = () => void

type ResultCallback = (results: ExpressionResult[]) => void

export class RecognitionManager {
  private worker: Worker
  private nextId = 1
  private pendingId = 0
  private callback: ResultCallback
  private onLoading?: LoadingCallback
  private onReady?: ReadyCallback
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private debounceMs: number
  // Cache of raw recognized LaTeX keyed by a group's stroke-id identity, so an
  // unchanged expression is never re-run through the (expensive) model.
  private latexCache = new Map<string, string>()
  private pendingInfos: { key: string; box: BBox; strokeIds: string[] }[] = []
  private static readonly CACHE_LIMIT = 256

  constructor(
    callback: ResultCallback,
    debounceMs = 600,
    onLoading?: LoadingCallback,
    onReady?: ReadyCallback,
  ) {
    this.callback = callback
    this.onLoading = onLoading
    this.onReady = onReady
    this.debounceMs = debounceMs
    // new URL + new Worker must be a single expression so Vite bundles the
    // worker and outputs a .js asset (not a raw .ts file with wrong MIME type)
    this.worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' },
    )
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

    const groups = groupStrokesByLine(strokes)
    this.pendingInfos = groups.map(g => {
      const strokeIds = g.map(s => s.id).sort()
      return { key: groupKey(strokeIds), box: boundsOf(g)!, strokeIds }
    })

    if (groups.length === 0) { this.callback([]); return }

    // Only run the model on expressions we haven't recognized before.
    const needInfer = groups.filter((_, i) => !this.latexCache.has(this.pendingInfos[i].key))
    const keys = this.pendingInfos.filter(info => !this.latexCache.has(info.key)).map(info => info.key)

    if (needInfer.length === 0) { this.emit(id); return }

    const groupData: StrokeData[][] = needInfer.map(group =>
      group.map(s => ({
        points: s.points.map(p => ({ x: p.x, y: p.y })),
        lineWidth: s.width,
      })),
    )
    this.worker.postMessage({ type: 'recognize', id, groups: groupData, keys })
  }

  /** Build and emit results for the current groups entirely from the latex cache. */
  private emit(id: number): void {
    if (id !== this.pendingId) return
    const results: ExpressionResult[] = this.pendingInfos.map(info => ({
      box: info.box,
      strokeIds: info.strokeIds,
      result: this.toResult(this.latexCache.get(info.key) ?? ''),
    }))
    this.callback(results)
  }

  private toResult(latex: string): RecognitionResult {
    if (!latex) return { status: 'empty' }
    const normalized = normalizeLatex(latex)
    if (!normalized) return { status: 'rejected', reason: 'unsupported LaTeX' }
    return { status: 'recognized', normalized, eval: evaluate(normalized) }
  }

  private cacheLatex(key: string, latex: string): void {
    // Simple bounded LRU: refresh insertion order, evict oldest over the limit.
    this.latexCache.delete(key)
    this.latexCache.set(key, latex)
    while (this.latexCache.size > RecognitionManager.CACHE_LIMIT) {
      this.latexCache.delete(this.latexCache.keys().next().value!)
    }
  }

  private handleMessage(e: MessageEvent<WorkerResponse>): void {
    const msg = e.data
    if (msg.type === 'ready') { this.onReady?.(); return }
    if (msg.type === 'loading') { this.onLoading?.(msg.message); return }
    if (msg.type === 'init-error') { this.onLoading?.(`Model load failed: ${msg.message}`); return }

    if (msg.type === 'result') {
      // Cache every returned latex (keyed by stroke identity, so always valid)
      // even if this response is stale — it may serve a later request.
      msg.keys.forEach((key, i) => {
        const latex = msg.latexes[i] ?? ''
        this.cacheLatex(key, latex)
        console.log(`[CalcInk] recognized "${latex}" for ${key.slice(0, 24)}…`)
      })
      this.emit(msg.id)
    }

    if (msg.type === 'error') {
      if (msg.id !== this.pendingId) return
      console.warn('[CalcInk] worker error:', msg.message)
      this.callback([])
    }
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.worker.terminate()
  }
}
