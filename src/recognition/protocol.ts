export type WorkerRequest =
  | { type: 'init' }
  | { type: 'recognize'; id: number; imageData: ImageData }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; latex: string }
  | { type: 'error'; id: number; message: string }
