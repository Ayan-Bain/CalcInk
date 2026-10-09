// CoMER handwritten-math recognition worker.
// Uses two ONNX sessions (encoder + decoder) running directly in ORT WASM.
// Model: 7.2 MB INT8 — purpose-built for CROHME handwritten LaTeX.
// Adapted from kimseungdae/ink-on (MIT)
import * as ort from 'onnxruntime-web'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { preprocessStrokes } from './preprocess'
import { fetchWithCache } from './modelCache'
import { repairLatex } from './latexRepair'

// Serve ORT WASM files from /ort-wasm/ (dev middleware + build asset plugin)
ort.env.wasm.wasmPaths = '/ort-wasm/'
// Single-threaded: threaded WASM is used but with 1 thread (no SharedArrayBuffer needed)
ort.env.wasm.numThreads = 1
ort.env.wasm.simd = true

const ENCODER_URL = '/models/comer/encoder_int8.onnx'
const DECODER_URL = '/models/comer/decoder_int8.onnx'
const VOCAB_URL = '/models/comer/vocab.json'

const MAX_STEPS = 50
const REPEAT_LIMIT = 3

interface Vocab {
  word2idx: Record<string, number>
  idx2word: Record<string, string>
  special_tokens: { pad: number; sos: number; eos: number }
  vocab_size: number
}

let encoderSession: ort.InferenceSession | null = null
let decoderSession: ort.InferenceSession | null = null
let vocab: Vocab | null = null
let activeId = -1

function postMsg(msg: WorkerResponse) { self.postMessage(msg) }

async function init() {
  console.log('[CalcInk worker] loading CoMER model (encoder + decoder)')
  postMsg({ type: 'loading', message: 'Downloading model (~7.2 MB)…' })

  const [encBuf, decBuf, vocabRes] = await Promise.all([
    fetchWithCache(ENCODER_URL),
    fetchWithCache(DECODER_URL),
    fetch(VOCAB_URL),
  ])
  vocab = await vocabRes.json() as Vocab

  postMsg({ type: 'loading', message: 'Initializing ONNX sessions…' })

  const opts: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'] }
  try {
    ;[encoderSession, decoderSession] = await Promise.all([
      ort.InferenceSession.create(encBuf, opts),
      ort.InferenceSession.create(decBuf, opts),
    ])
  } catch (e) {
    // fallback with default options
    ;[encoderSession, decoderSession] = await Promise.all([
      ort.InferenceSession.create(encBuf, {}),
      ort.InferenceSession.create(decBuf, {}),
    ])
  }

  console.log('[CalcInk worker] CoMER ready')
}

function logSoftmax(logits: Float32Array, offset: number, size: number): Float64Array {
  const result = new Float64Array(size)
  let max = -Infinity
  for (let i = 0; i < size; i++) { const v = logits[offset + i]!; if (v > max) max = v }
  let sumExp = 0
  for (let i = 0; i < size; i++) sumExp += Math.exp(logits[offset + i]! - max)
  const logSumExp = Math.log(sumExp)
  for (let i = 0; i < size; i++) result[i] = logits[offset + i]! - max - logSumExp
  return result
}

async function runDecoder(
  ids: number[],
  encFeatures: ort.Tensor,
  encMask: ort.Tensor,
): Promise<Float32Array> {
  const inputIds = new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length])
  const res = await decoderSession!.run({ encoder_features: encFeatures, encoder_mask: encMask, input_ids: inputIds })
  inputIds.dispose()
  return res['logits']!.data as Float32Array
}

async function greedyDecode(
  encFeatures: ort.Tensor,
  encMask: ort.Tensor,
  sos: number,
  eos: number,
  vocabSize: number,
): Promise<number[]> {
  const ids: number[] = [sos]
  let repeatCount = 0
  let lastToken = -1

  for (let step = 0; step < MAX_STEPS; step++) {
    const logits = await runDecoder(ids, encFeatures, encMask)
    const logProbs = logSoftmax(logits, (ids.length - 1) * vocabSize, vocabSize)

    let maxVal = -Infinity, maxIdx = 0
    for (let i = 0; i < vocabSize; i++) {
      if (logProbs[i]! > maxVal) { maxVal = logProbs[i]!; maxIdx = i }
    }

    if (maxIdx === eos) break
    if (maxIdx === lastToken) { if (++repeatCount >= REPEAT_LIMIT) break }
    else repeatCount = 0
    lastToken = maxIdx
    ids.push(maxIdx)
  }

  return ids.slice(1)  // strip <sos>
}

function decodeTokens(ids: number[], v: Vocab): string[] {
  const skip = new Set([v.special_tokens.pad, v.special_tokens.sos, v.special_tokens.eos])
  return ids.filter(id => !skip.has(id)).map(id => v.idx2word[String(id)] ?? '')
}

async function recognize(strokes: import('./protocol').StrokeData[], requestId: number): Promise<string> {
  if (!encoderSession || !decoderSession || !vocab) throw new Error('Model not loaded')

  console.log(`[CalcInk worker] recognize id=${requestId} strokes=${strokes.length}`)
  const t0 = performance.now()

  const prep = preprocessStrokes(strokes)
  const pixelValues = new ort.Tensor('float32', prep.tensor, [1, 1, prep.height, prep.width])
  const pixelMask = new ort.Tensor('bool', prep.mask, [1, prep.maskHeight, prep.maskWidth])

  const encResult = await encoderSession.run({ pixel_values: pixelValues, pixel_mask: pixelMask })
  pixelValues.dispose()
  pixelMask.dispose()

  const encFeatures = encResult['encoder_features']!
  const encMask = encResult['encoder_mask']!

  if (activeId !== requestId) { encFeatures.dispose(); encMask.dispose(); throw new Error('cancelled') }

  const { sos, eos } = vocab.special_tokens
  const ids = await greedyDecode(encFeatures, encMask, sos, eos, vocab.vocab_size)
  encFeatures.dispose()
  encMask.dispose()

  if (activeId !== requestId) throw new Error('cancelled')

  const tokens = decodeTokens(ids, vocab)
  const repaired = repairLatex(tokens)
  const latex = repaired.join(' ')
  console.log(`[CalcInk worker] result id=${requestId} (${(performance.now() - t0).toFixed(0)}ms): "${latex}"`)
  return latex
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data

  if (req.type === 'init') {
    try {
      await init()
      postMsg({ type: 'ready' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[CalcInk worker] init failed:', err)
      postMsg({ type: 'init-error', message })
    }
    return
  }

  if (req.type === 'recognize') {
    activeId = req.id
    try {
      const latexes: string[] = []
      for (const group of req.groups) {
        try {
          latexes.push(await recognize(group, req.id))
        } catch (err) {
          // A newer edit cancels the whole batch; other errors just blank that line.
          if (err instanceof Error && err.message === 'cancelled') return
          latexes.push('')
        }
      }
      if (activeId === req.id) postMsg({ type: 'result', id: req.id, latexes, keys: req.keys ?? [] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'cancelled') return
      postMsg({ type: 'error', id: req.id, message })
    }
  }
}
