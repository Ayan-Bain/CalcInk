// Web Worker: runs ONNX model inference off the main thread.
// Currently a stub that will be replaced with RapidLatexOCR in Stage 5.

import type { WorkerRequest, WorkerResponse } from './protocol'

let ready = false

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data

  if (req.type === 'init') {
    // TODO Stage 5: load ONNX sessions here
    ready = true
    const resp: WorkerResponse = { type: 'ready' }
    self.postMessage(resp)
    return
  }

  if (req.type === 'recognize') {
    if (!ready) {
      const resp: WorkerResponse = { type: 'error', id: req.id, message: 'Worker not initialized' }
      self.postMessage(resp)
      return
    }

    try {
      // TODO Stage 5: run actual ONNX inference
      // For now, return empty string to indicate "no recognition yet"
      const resp: WorkerResponse = { type: 'result', id: req.id, latex: '' }
      self.postMessage(resp)
    } catch (err: any) {
      const resp: WorkerResponse = { type: 'error', id: req.id, message: String(err) }
      self.postMessage(resp)
    }
  }
}
