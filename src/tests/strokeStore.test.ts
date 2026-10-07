import { describe, it, expect, beforeEach } from 'vitest'
import { StrokeStore } from '../ink/StrokeStore'
import type { Stroke } from '../ink/types'

function makeStroke(id: string): Stroke {
  return { id, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], width: 3, color: '#000' }
}

describe('StrokeStore', () => {
  let store: StrokeStore

  beforeEach(() => { store = new StrokeStore() })

  it('starts empty', () => {
    expect(store.getStrokes()).toHaveLength(0)
  })

  it('adds strokes', () => {
    store.addStroke(makeStroke('a'))
    expect(store.getStrokes()).toHaveLength(1)
  })

  it('undo removes last stroke', () => {
    store.addStroke(makeStroke('a'))
    store.undo()
    expect(store.getStrokes()).toHaveLength(0)
  })

  it('redo re-adds stroke', () => {
    store.addStroke(makeStroke('a'))
    store.undo()
    store.redo()
    expect(store.getStrokes()).toHaveLength(1)
  })

  it('clear removes all strokes and is undoable', () => {
    store.addStroke(makeStroke('a'))
    store.addStroke(makeStroke('b'))
    store.clear()
    expect(store.getStrokes()).toHaveLength(0)
    store.undo()
    expect(store.getStrokes()).toHaveLength(2)
  })

  it('removeStrokes by id', () => {
    store.addStroke(makeStroke('a'))
    store.addStroke(makeStroke('b'))
    store.removeStrokes(new Set(['a']))
    expect(store.getStrokes().map(s => s.id)).toEqual(['b'])
  })

  it('undo after remove restores', () => {
    store.addStroke(makeStroke('a'))
    store.addStroke(makeStroke('b'))
    store.removeStrokes(new Set(['a']))
    store.undo()
    expect(store.getStrokes()).toHaveLength(2)
  })

  it('redo stack cleared after new stroke', () => {
    store.addStroke(makeStroke('a'))
    store.undo()
    store.addStroke(makeStroke('b'))
    const didRedo = store.redo()
    expect(didRedo).toBe(false)
  })
})
