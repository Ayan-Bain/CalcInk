import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { InkCanvas } from '../canvas/InkCanvas'
import { useCanvasController, type Tool } from '../canvas/useCanvasController'
import { ResultDisplay } from '../projection/ResultDisplay'
import { strokesBoundingBox } from '../ink/types'
import { rasterizeCrop } from '../canvas/renderer'
import type { RecognitionResult } from '../recognition/RecognitionManager'
import type { EvalResult } from '../math/evaluator'
import './App.css'

const BenchmarkPage = lazy(() => import('../benchmark/BenchmarkPage'))

const CANVAS_WIDTH = Math.min(window.innerWidth - 32, 900)
const CANVAS_HEIGHT = Math.max(300, Math.round(CANVAS_WIDTH * 0.45))

const STROKE_WIDTHS = [2, 4, 6, 10]

type Tab = 'draw' | 'benchmark'

export default function App() {
  const [tab, setTab] = useState<Tab>('draw')
  const [tool, setTool] = useState<Tool>('pen')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [color] = useState('#1a1a2e')

  const { strokes, onPointerDown, onPointerMove, onPointerUp, undo, redo, clear } =
    useCanvasController(strokeWidth, color, tool)

  const [recResult, setRecResult] = useState<RecognitionResult | null>(null)
  const [modelStatus, setModelStatus] = useState<string>('Loading models…')
  const [modelsReady, setModelsReady] = useState(false)
  const managerRef = useRef<import('../recognition/RecognitionManager').RecognitionManager | null>(null)

  useEffect(() => {
    let mounted = true
    import('../recognition/RecognitionManager').then(({ RecognitionManager }) => {
      if (!mounted) return
      const workerUrl = new URL('../recognition/worker.ts', import.meta.url)
      managerRef.current = new RecognitionManager(
        workerUrl,
        result => { if (mounted) setRecResult(result) },
        600,
        msg => { if (mounted) setModelStatus(msg) },
      )
      const worker = (managerRef.current as any).worker as Worker
      const origHandler = worker.onmessage?.bind(worker)
      worker.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'ready' && mounted) {
          setModelsReady(true)
          setModelStatus('Ready')
        }
        origHandler?.(e)
      }
    })
    return () => { mounted = false; managerRef.current?.destroy() }
  }, [])

  // Reactive recognition — re-runs on every stroke edit
  useEffect(() => {
    if (!modelsReady) return
    if (strokes.length === 0) { setRecResult(null); return }
    const box = strokesBoundingBox([...strokes])
    if (!box || box.width < 1 || box.height < 1) return
    // Render at natural bounding-box size (+ padding) to preserve aspect ratio.
    // Forcing a fixed 512×128 distorts the image and confuses the model.
    const PAD = 20
    const crop = {
      x: box.x - PAD, y: box.y - PAD,
      width: box.width + PAD * 2, height: box.height + PAD * 2,
    }
    const imgData = rasterizeCrop(strokes, crop, crop.width, crop.height)
    managerRef.current?.scheduleRecognition(imgData)
  }, [strokes, modelsReady])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const evalResult: EvalResult | null = recResult?.status === 'recognized' ? recResult.eval : null
  const normalized = recResult?.status === 'recognized' ? recResult.normalized : null
  const displayStatus = recResult === null ? 'idle' : recResult.status

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">CalcInk</h1>
        <p className="app-subtitle">Handwritten arithmetic calculator — 100% client-side</p>
      </header>

      <div className="tab-bar">
        <button onClick={() => setTab('draw')} className={`tab-btn ${tab === 'draw' ? 'active' : ''}`}>Draw</button>
        <button onClick={() => setTab('benchmark')} className={`tab-btn ${tab === 'benchmark' ? 'active' : ''}`}>Benchmark</button>
        <span className={`model-status ${modelsReady ? 'ready' : 'loading'}`}>{modelStatus}</span>
      </div>

      {tab === 'draw' && (
        <>
          <div className="toolbar">
            <button onClick={() => setTool('pen')} className={`tool-btn ${tool === 'pen' ? 'active' : ''}`} title="Pen">✏️</button>
            <button onClick={() => setTool('stroke-eraser')} className={`tool-btn ${tool === 'stroke-eraser' ? 'active' : ''}`} title="Stroke Eraser">🖊</button>
            <div className="divider" />
            {STROKE_WIDTHS.map(w => (
              <button key={w} onClick={() => setStrokeWidth(w)} className={`width-btn ${strokeWidth === w ? 'active' : ''}`} title={`Width ${w}`}>
                <span style={{ display: 'block', width: w * 2, height: w * 2, borderRadius: '50%', background: 'currentColor' }} />
              </button>
            ))}
            <div className="divider" />
            <button onClick={undo} className="tool-btn" title="Undo (Ctrl+Z)">↩</button>
            <button onClick={redo} className="tool-btn" title="Redo (Ctrl+Y)">↪</button>
            <button onClick={clear} className="tool-btn" title="Clear">🗑</button>
          </div>

          <div className="canvas-wrapper">
            <InkCanvas
              strokes={strokes}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
            />
          </div>

          <ResultDisplay evalResult={evalResult} normalized={normalized} status={displayStatus} />
        </>
      )}

      {tab === 'benchmark' && (
        <Suspense fallback={<div style={{ padding: 24, color: '#888' }}>Loading benchmark…</div>}>
          <BenchmarkPage />
        </Suspense>
      )}

      <footer className="app-footer">
        <small>Recognition: RapidLatexOCR ONNX (MIT) · All inference runs locally · No data leaves your device</small>
      </footer>
    </div>
  )
}
