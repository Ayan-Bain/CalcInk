import { useCallback, useEffect, useRef, useState } from 'react'
import { StrokeStore } from '../ink/StrokeStore'
import { findStrokesNearPoint } from './eraser'
import type { Stroke } from '../ink/types'

export type Tool = 'pen' | 'stroke-eraser' | 'pixel-eraser'

const STORAGE_KEY = 'calcink.strokes.v1'

let strokeSeq = 0

function isStroke(v: any): v is Stroke {
  return (
    v && typeof v === 'object' &&
    typeof v.id === 'string' &&
    Array.isArray(v.points) &&
    typeof v.width === 'number' &&
    typeof v.color === 'string'
  )
}

/** Load persisted strokes from localStorage, returning [] on any failure. */
function loadStrokes(): Stroke[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isStroke)) return []
    // Bump the id counter past any restored numeric suffix to avoid collisions.
    for (const s of parsed) {
      const m = /^s(\d+)$/.exec(s.id)
      if (m) strokeSeq = Math.max(strokeSeq, Number(m[1]))
    }
    return parsed as Stroke[]
  } catch {
    return []
  }
}

export function useCanvasController(strokeWidth: number, color: string, tool: Tool) {
  const [store] = useState(() => new StrokeStore(loadStrokes()))
  const [strokes, setStrokes] = useState<readonly Stroke[]>(() => store.getStrokes())

  // Persist strokes on every change (covers draw/erase/undo/redo/clear).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(strokes))
    } catch { /* quota / private mode — ignore */ }
  }, [strokes])
  const activeStrokeRef = useRef<Stroke | null>(null)
  const isDownRef = useRef(false)

  const syncStrokes = useCallback(() => {
    setStrokes(store.getStrokes())
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
      store.addStroke(stroke)
      syncStrokes()
    } else if (tool === 'stroke-eraser') {
      const hit = findStrokesNearPoint(store.getStrokes(), x, y, strokeWidth * 2)
      store.removeStrokes(hit)
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
      const all = store.getStrokes()
      const prev = all[all.length - 1]
      if (prev?.id === updated.id) {
        store.removeStrokes(new Set([prev.id]))
        store.addStroke(updated)
        // undo accounting: treat in-progress stroke as one undoable action
        const undo = (store as any).undoStack as Stroke[][]
        if (undo.length > 1) undo.splice(undo.length - 1, 1)
      }
      syncStrokes()
    } else if (tool === 'stroke-eraser') {
      const hit = findStrokesNearPoint(store.getStrokes(), x, y, strokeWidth * 2)
      store.removeStrokes(hit)
      syncStrokes()
    }
  }, [tool, strokeWidth, syncStrokes])

  const onPointerUp = useCallback(() => {
    isDownRef.current = false
    activeStrokeRef.current = null
  }, [])

  const undo = useCallback(() => { store.undo(); syncStrokes() }, [syncStrokes])
  const redo = useCallback(() => { store.redo(); syncStrokes() }, [syncStrokes])
  const clear = useCallback(() => { store.clear(); syncStrokes() }, [syncStrokes])

  return { strokes, onPointerDown, onPointerMove, onPointerUp, undo, redo, clear, store }
}
