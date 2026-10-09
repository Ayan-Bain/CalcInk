import { useEffect, useRef, useState } from 'react'
import type { Stroke } from '../ink/types'
import { renderStrokes, type CanvasBackground, type CanvasTheme } from './renderer'
import type { PlacedAnswer } from './answerOverlay'

interface Props {
  strokes: readonly Stroke[]
  onPointerDown: (x: number, y: number) => void
  onPointerMove: (x: number, y: number) => void
  onPointerUp: () => void
  width: number
  height: number
  answers: readonly PlacedAnswer[]
  background: CanvasBackground
  theme: CanvasTheme
}

export function InkCanvas({ strokes, onPointerDown, onPointerMove, onPointerUp, width, height, answers, background, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dpr = window.devicePixelRatio || 1

  // The answer font is a web font; redraw once it's loaded so canvas text
  // doesn't render in the fallback (canvas silently falls back otherwise).
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => {
    let alive = true
    document.fonts?.load("32px 'Patrick Hand'").then(() => { if (alive) setFontReady(true) }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderStrokes(ctx, strokes, width, height, dpr, answers, background, theme)
  }, [strokes, width, height, dpr, answers, background, theme, fontReady])

  function coords(e: React.PointerEvent): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  return (
    <canvas
      ref={canvasRef}
      width={width * dpr}
      height={height * dpr}
      style={{ width, height, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const [x, y] = coords(e); onPointerDown(x, y) }}
      onPointerMove={e => { const [x, y] = coords(e); onPointerMove(x, y) }}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}
