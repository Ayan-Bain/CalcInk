import { env, pipeline, RawImage } from '@huggingface/transformers'
import type { WorkerRequest, WorkerResponse } from './protocol'

const MODEL_ID = 'onnx-community/latex_finetuned-ONNX'
const MODEL_REVISION = 'cdc13b093c439bb894fd11d8bbd8d237ed16a257'

// Disable ORT WASM multi-threading. The threaded WASM backend requires
// SharedArrayBuffer, which needs COOP/COEP headers. Without them the
// inference call blocks forever waiting on a SharedArrayBuffer atomic.
// Single-threaded WASM is slower but works in any browser context.
env.backends.onnx.wasm.numThreads = 1

// Some HuggingFace repos name the merged decoder differently; redirect to the split file.
const _origFetch = env.fetch
env.fetch = (input, init) => {
  // Safely extract the URL string regardless of whether input is a URL, string, or Request.
  const rawUrl =
    input instanceof URL     ? input.href :
    input instanceof Request ? input.url  :
    String(input)

  if (rawUrl.endsWith('/decoder_model_merged_q4.onnx')) {
    const fixed = rawUrl.replace(/decoder_model_merged_q4\.onnx$/, 'decoder_model_q4.onnx')
    return _origFetch(fixed, init)
  }
  // Pass the original input unchanged so headers / method / body are preserved.
  return _origFetch(input, init)
}

function loadRecognizer() {
  let lastProgress = -1
  return pipeline('image-to-text', MODEL_ID, {
    device: 'wasm',
    dtype: 'q4',
    revision: MODEL_REVISION,
    progress_callback: progress => {
      console.log('[CalcInk worker] progress:', progress.status, progress.file ?? '', progress.progress ?? '')
      // transformers.js emits status:'progress' (not 'progress_total') for ongoing downloads
      if (progress.status !== 'progress') return
      const percent = Math.round(progress.progress ?? 0)
      if (percent === lastProgress) return
      lastProgress = percent
      self.postMessage({
        type: 'loading',
        message: `Downloading model: ${percent}%`,
      } satisfies WorkerResponse)
    },
  })
}

type Recognizer = Awaited<ReturnType<typeof loadRecognizer>>

let recognizer: Recognizer | null = null
let activeRequestId = -1

async function init(): Promise<void> {
  console.log('[CalcInk worker] init — model:', MODEL_ID, 'revision:', MODEL_REVISION)
  self.postMessage({
    type: 'loading',
    message: 'Loading handwriting model (first load downloads about 402 MiB)…',
  } satisfies WorkerResponse)
  recognizer = await loadRecognizer()
  console.log('[CalcInk worker] model ready')
}

async function recognize(imageData: ImageData, requestId: number): Promise<string> {
  if (!recognizer) throw new Error('Handwriting model is not loaded')

  console.log(`[CalcInk worker] recognize id=${requestId} image=${imageData.width}×${imageData.height}`)
  const t0 = performance.now()

  const image = new RawImage(imageData.data, imageData.width, imageData.height, 4)
  const output = await recognizer(image, {
    max_new_tokens: 128,
    num_beams: 1,
    do_sample: false,
  })

  if (activeRequestId !== requestId) throw new Error('cancelled')
  const latex = output[0]?.generated_text.trim() ?? ''
  console.log(`[CalcInk worker] result id=${requestId} (${(performance.now()-t0).toFixed(0)}ms): "${latex}"`)
  return latex
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data

  if (req.type === 'init') {
    try {
      await init()
      self.postMessage({ type: 'ready' } satisfies WorkerResponse)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[CalcInk worker] model init failed:', err)
      self.postMessage({ type: 'init-error', message } satisfies WorkerResponse)
    }
    return
  }

  if (req.type === 'recognize') {
    activeRequestId = req.id
    try {
      const latex = await recognize(req.imageData, req.id)
      if (activeRequestId === req.id) {
        self.postMessage({ type: 'result', id: req.id, latex } satisfies WorkerResponse)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('cancelled')) return
      self.postMessage({ type: 'error', id: req.id, message } satisfies WorkerResponse)
    }
  }
}
