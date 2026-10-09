import type { Stroke } from './types'

export interface StrokeStoreSnapshot {
  strokes: Stroke[]
}

export class StrokeStore {
  private strokes: Stroke[]
  private undoStack: Stroke[][] = []
  private redoStack: Stroke[][] = []

  constructor(initialStrokes: Stroke[] = []) {
    this.strokes = [...initialStrokes]
  }

  getStrokes(): readonly Stroke[] { return this.strokes }

  addStroke(stroke: Stroke): void {
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes = [...this.strokes, stroke]
  }

  removeStrokes(ids: Set<string>): void {
    if (ids.size === 0) return
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes = this.strokes.filter(s => !ids.has(s.id))
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false
    this.redoStack.push([...this.strokes])
    this.strokes = this.undoStack.pop()!
    return true
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false
    this.undoStack.push([...this.strokes])
    this.strokes = this.redoStack.pop()!
    return true
  }

  clear(): void {
    if (this.strokes.length === 0) return
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes = []
  }

  snapshot(): StrokeStoreSnapshot {
    return { strokes: [...this.strokes] }
  }
}
