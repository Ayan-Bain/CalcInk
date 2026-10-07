export interface StrokeData {
  points: { x: number; y: number }[]
  lineWidth: number
}

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'recognize'; id: number; strokes: StrokeData[] }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'loading'; message: string }
  | { type: 'init-error'; message: string }
  | { type: 'result'; id: number; latex: string }
  | { type: 'error'; id: number; message: string }
