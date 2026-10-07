import { useEffect, useRef } from 'react'
import type { Stroke } from '../ink/types'
import { renderStrokes } from './renderer'

interface Props {
  strokes: readonly Stroke[]
  onPointerDown: (x: number, y: number) => void
  onPointerMove: (x: number, y: number) => void
  onPointerUp: () => void
  width: number
  height: number
}

export function InkCanvas({ strokes, onPointerDown, onPointerMove, onPointerUp, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dpr = window.devicePixelRatio || 1

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderStrokes(ctx, strokes, width, height, dpr)
  }, [strokes, width, height, dpr])

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
