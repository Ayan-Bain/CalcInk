import { useCallback, useRef, useState } from 'react'
import { StrokeStore } from '../ink/StrokeStore'
import { findStrokesNearPoint } from './eraser'
import type { Stroke } from '../ink/types'

export type Tool = 'pen' | 'stroke-eraser' | 'pixel-eraser'

let strokeSeq = 0

export function useCanvasController(strokeWidth: number, color: string, tool: Tool) {
  const storeRef = useRef(new StrokeStore())
  const [strokes, setStrokes] = useState<readonly Stroke[]>([])
  const activeStrokeRef = useRef<Stroke | null>(null)
  const isDownRef = useRef(false)

  const syncStrokes = useCallback(() => {
    setStrokes(storeRef.current.getStrokes())
  }, [])

  const onPointerDown = useCallback((x: number, y: number) => {
    isDownRef.current = true
    if (tool === 'pen') {
      const stroke: Stroke = {
        id: `s${++strokeSeq}`,
        points: [{ x, y }],
        width: strokeWidth,
        color,
      }
      activeStrokeRef.current = stroke
      storeRef.current.addStroke(stroke)
      syncStrokes()
    } else if (tool === 'stroke-eraser') {
      const hit = findStrokesNearPoint(storeRef.current.getStrokes(), x, y, strokeWidth * 2)
      storeRef.current.removeStrokes(hit)
      syncStrokes()
    }
  }, [tool, strokeWidth, color, syncStrokes])

  const onPointerMove = useCallback((x: number, y: number) => {
    if (!isDownRef.current) return
    if (tool === 'pen' && activeStrokeRef.current) {
      const updated: Stroke = {
        ...activeStrokeRef.current,
        points: [...activeStrokeRef.current.points, { x, y }],
      }
      activeStrokeRef.current = updated
      // replace last stroke in store (the one we're drawing)
      const all = storeRef.current.getStrokes()
      const prev = all[all.length - 1]
      if (prev?.id === updated.id) {
        storeRef.current.removeStrokes(new Set([prev.id]))
        storeRef.current.addStroke(updated)
        // undo accounting: treat in-progress stroke as one undoable action
        const undo = (storeRef.current as any).undoStack as Stroke[][]
        if (undo.length > 1) undo.splice(undo.length - 1, 1)
      }
      syncStrokes()
    } else if (tool === 'stroke-eraser') {
      const hit = findStrokesNearPoint(storeRef.current.getStrokes(), x, y, strokeWidth * 2)
      storeRef.current.removeStrokes(hit)
      syncStrokes()
    }
  }, [tool, strokeWidth, syncStrokes])

  const onPointerUp = useCallback(() => {
    isDownRef.current = false
    activeStrokeRef.current = null
  }, [])

  const undo = useCallback(() => { storeRef.current.undo(); syncStrokes() }, [syncStrokes])
  const redo = useCallback(() => { storeRef.current.redo(); syncStrokes() }, [syncStrokes])
  const clear = useCallback(() => { storeRef.current.clear(); syncStrokes() }, [syncStrokes])

  return { strokes, onPointerDown, onPointerMove, onPointerUp, undo, redo, clear, store: storeRef.current }
}
