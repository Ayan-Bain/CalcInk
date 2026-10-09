import { useEffect, useRef, useState } from 'react'
import { InkCanvas } from '../canvas/InkCanvas'
import { useCanvasController, type Tool } from '../canvas/useCanvasController'
import { placeAnswers } from '../canvas/answerOverlay'
import { exportCanvasPng, LIGHT_THEME, DARK_THEME, type CanvasBackground } from '../canvas/renderer'
import { boundsOf } from '../recognition/segment'
import type { ExpressionResult } from '../recognition/RecognitionManager'
import './App.css'

const STROKE_WIDTHS = [2, 4, 6, 10]

const BACKGROUNDS: { key: CanvasBackground; label: string; icon: string }[] = [
  { key: 'ruled', label: 'Ruled', icon: '▤' },
  { key: 'graph', label: 'Graph', icon: '▦' },
  { key: 'blank', label: 'Blank', icon: '▢' },
]

const BG_KEY = 'calcink.background.v1'
const DARK_KEY = 'calcink.dark.v1'

function loadBackground(): CanvasBackground {
  try {
    const v = localStorage.getItem(BG_KEY)
    if (v === 'ruled' || v === 'graph' || v === 'blank') return v
  } catch { /* ignore */ }
  return 'ruled'
}

function loadDark(): boolean {
  try {
    const v = localStorage.getItem(DARK_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export default function App() {
  const [tool, setTool] = useState<Tool>('pen')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [color] = useState('#1a1a2e')
  const [background, setBackground] = useState<CanvasBackground>(loadBackground)
  const [dark, setDark] = useState<boolean>(loadDark)
  const theme = dark ? DARK_THEME : LIGHT_THEME

  // Canvas width tracks the viewport; height is a growable scroll area.
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const [canvasHeight, setCanvasHeight] = useState(() => window.innerHeight)
  useEffect(() => {
    const onResize = () => {
      setSize({ w: window.innerWidth, h: window.innerHeight })
      setCanvasHeight(h => Math.max(h, window.innerHeight))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    try { localStorage.setItem(BG_KEY, background) } catch { /* ignore */ }
  }, [background])

  useEffect(() => {
    try { localStorage.setItem(DARK_KEY, dark ? '1' : '0') } catch { /* ignore */ }
  }, [dark])

  const { strokes, onPointerDown, onPointerMove, onPointerUp, undo, redo, clear } =
    useCanvasController(strokeWidth, color, tool)

  // Keep the canvas tall enough to hold all ink (covers restored strokes and
  // writing near the bottom), never shrinking below what's already shown.
  useEffect(() => {
    const b = boundsOf(strokes)
    if (b) setCanvasHeight(h => Math.max(h, b.maxY + 200))
  }, [strokes])

  // Grow the scroll area whenever the user reaches (or wheels past) the bottom.
  function growIfAtBottom(el: HTMLDivElement) {
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      setCanvasHeight(h => h + Math.round(window.innerHeight * 0.8))
    }
  }
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    growIfAtBottom(e.currentTarget)
  }
  // Wheel bootstraps growth when the canvas isn't yet tall enough to scroll.
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (e.deltaY > 0) growIfAtBottom(e.currentTarget)
  }

  const [results, setResults] = useState<ExpressionResult[]>([])
  const [modelStatus, setModelStatus] = useState<string>('Loading models…')
  const [modelsReady, setModelsReady] = useState(false)
  const managerRef = useRef<import('../recognition/RecognitionManager').RecognitionManager | null>(null)

  useEffect(() => {
    let mounted = true
    import('../recognition/RecognitionManager').then(({ RecognitionManager }) => {
      if (!mounted) return
      managerRef.current = new RecognitionManager(
        res => { if (mounted) setResults(res) },
        600,
        msg => { if (mounted) setModelStatus(msg) },
        () => { if (mounted) { setModelsReady(true); setModelStatus('Ready') } },
      )
    })
    return () => { mounted = false; managerRef.current?.destroy() }
  }, [])

  // Reactive recognition — re-runs on every stroke edit
  useEffect(() => {
    if (!modelsReady) return
    if (strokes.length === 0) { setResults([]); return }
    managerRef.current?.scheduleRecognition([...strokes])
  }, [strokes, modelsReady])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // Keep each expression's answer on screen unless its own strokes changed.
  const answers = placeAnswers(strokes, results, dark)

  function handleExport() {
    exportCanvasPng([...strokes], answers, size.w, canvasHeight, window.devicePixelRatio || 1, background, theme)
  }

  return (
    <div className={`draw-view ${dark ? 'dark' : ''}`} onScroll={onScroll} onWheel={onWheel}>
      <InkCanvas
        strokes={strokes}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        width={size.w}
        height={canvasHeight}
        answers={answers}
        background={background}
        theme={theme}
      />

      <div className="overlay-top">
        <div className="tab-bar floating">
          <span className="brand">CalcInk</span>
          <span className={`model-status ${modelsReady ? 'ready' : 'loading'}`}>{modelStatus}</span>
        </div>

        <div className="toolbar floating">
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
            <div className="divider" />
            <button onClick={handleExport} className="tool-btn" title="Export as PNG" disabled={strokes.length === 0}>⬇</button>
            <div className="divider" />
            {BACKGROUNDS.map(b => (
              <button
                key={b.key}
                onClick={() => setBackground(b.key)}
                className={`tool-btn ${background === b.key ? 'active' : ''}`}
                title={`${b.label} background`}
              >{b.icon}</button>
            ))}
            <div className="divider" />
            <button
              onClick={() => setDark(d => !d)}
              className="tool-btn"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >{dark ? '☀️' : '🌙'}</button>
          </div>
        </div>
      </div>
  )
}
