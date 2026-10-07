// Web Worker: runs RapidLatexOCR ONNX inference off the main thread.
// Tensor names confirmed from SWHL/ConvertLaTeXOCRToONNX source:
//   image_resizer: input="input"  output="output"
//   encoder:       input="input"  output="output"
//   decoder:       inputs=["x","mask","context"]  output="output"

import * as ort from 'onnxruntime-web'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { preprocessResized, resizeGray } from './preprocess'

// Point ORT to the locally served WASM binaries and the matching runtime modules.
ort.env.wasm.wasmPaths = '/ort-wasm/'

// Tokenizer vocab: id → string (loaded from tokenizer.json)
let idToToken: string[] = []

// ONNX sessions
let resizerSession: ort.InferenceSession | null = null
let encoderSession: ort.InferenceSession | null = null
let decoderSession: ort.InferenceSession | null = null

// Cancellation: set to the current request id; decoder loop checks this
let activeRequestId = -1

const BOS_TOKEN = 1
const EOS_TOKEN = 2
// Arithmetic expressions are short. 64 is ample and saves many decoder round-trips.
const MAX_SEQ = 64
const TEMPERATURE = 0.00001  // near-deterministic (greedy)
const TOP_K_THRES = 0.9      // keep top 10% of logits

// ---- bootstrap ----

async function init() {
  console.log('[CalcInk worker] init start')
  const opts: ort.InferenceSession.SessionOptions = {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  }

  // Load tokenizer
  console.log('[CalcInk worker] fetching tokenizer…')
  const tokenizerResp = await fetch('/models/tokenizer.json')
  const tokenizerJson = await tokenizerResp.json()
  const vocab: Record<string, number> = tokenizerJson.model.vocab
  idToToken = new Array(Object.keys(vocab).length)
  for (const [tok, id] of Object.entries(vocab)) {
    idToToken[id] = tok
  }

  // Load ONNX sessions (sequential so progress messages are meaningful)
  self.postMessage({ type: 'loading', message: 'Loading image resizer…' } satisfies WorkerResponse)
  resizerSession = await ort.InferenceSession.create('/models/image_resizer.onnx', opts)

  self.postMessage({ type: 'loading', message: 'Loading encoder…' } satisfies WorkerResponse)
  encoderSession = await ort.InferenceSession.create('/models/encoder.onnx', opts)

  self.postMessage({ type: 'loading', message: 'Loading decoder…' } satisfies WorkerResponse)
  decoderSession = await ort.InferenceSession.create('/models/decoder.onnx', opts)
}

// ---- inference ----

async function recognize(imageData: ImageData, requestId: number): Promise<string> {
  const finalTensor = await imageResizerLoop(imageData)
  if (activeRequestId !== requestId) throw new Error('cancelled')

  const context = await runEncoder(finalTensor)
  if (activeRequestId !== requestId) throw new Error('cancelled')

  const tokens = await runDecoder(context, requestId)
  return decodeTokens(tokens)
}

async function imageResizerLoop(imageData: ImageData): Promise<{ data: Float32Array; w: number; h: number }> {
  const { gray: initialGray, width: igW, height: igH } = getInitialGray(imageData)
  let r = 1, w = igW, h = igH

  let finalTensor: { data: Float32Array<ArrayBuffer>; w: number; h: number } = { data: new Float32Array(0), w: 0, h: 0 }

  console.log(`[CalcInk worker] resizer input: ${igW}×${igH}`)

  for (let iter = 0; iter < 10; iter++) {
    h = Math.round(h * r)

    // Resize input image to (w, h)
    const resizedGray = resizeGray(initialGray, igW, igH, w, h)
    const { tensor, width: pw, height: ph } = preprocessResized(resizedGray, w, h)

    finalTensor = { data: new Float32Array(tensor), w: pw, h: ph }

    // Run image resizer
    const inputTensor = new ort.Tensor('float32', new Float32Array(tensor), [1, 1, ph, pw])
    const resizerOut = await resizerSession!.run({ input: inputTensor })
    const resizerData = resizerOut['output'].data as Float32Array

    // argmax → predicted width
    let maxIdx = 0
    for (let i = 1; i < resizerData.length; i++) {
      if (resizerData[i] > resizerData[maxIdx]) maxIdx = i
    }
    const predictedW = (maxIdx + 1) * 32

    console.log(`[CalcInk worker] resizer iter ${iter}: input ${pw}×${ph} → predicted width ${predictedW}`)

    if (predictedW === pw) break  // converged

    r = predictedW / pw
    w = predictedW
  }

  console.log(`[CalcInk worker] encoder input: ${finalTensor.w}×${finalTensor.h}`)
  return finalTensor
}

function getInitialGray(imageData: ImageData): { gray: Float32Array; width: number; height: number } {
  // Use the full preprocessImage pipeline to get initial padded/sized gray
  // but we need the raw gray before normalization for the resizer loop
  const { data, width: w, height: h } = imageData
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return { gray, width: w, height: h }
}

async function runEncoder(input: { data: Float32Array; w: number; h: number }): Promise<ort.Tensor> {
  const inputTensor = new ort.Tensor('float32', new Float32Array(input.data), [1, 1, input.h, input.w])
  const out = await encoderSession!.run({ input: inputTensor })
  return out['output']
}

async function runDecoder(context: ort.Tensor, requestId: number): Promise<number[]> {
  let tokens = [BOS_TOKEN]

  for (let step = 0; step < MAX_SEQ; step++) {
    // Stale-result cancellation: abort if a newer request superseded this one
    if (activeRequestId !== requestId) throw new Error('cancelled')

    const seqLen = Math.min(tokens.length, MAX_SEQ)
    const x = new BigInt64Array(seqLen)
    const mask = new Uint8Array(seqLen).fill(1)

    for (let i = 0; i < seqLen; i++) x[i] = BigInt(tokens[tokens.length - seqLen + i])

    const xTensor    = new ort.Tensor('int64', x, [1, seqLen])
    const maskTensor = new ort.Tensor('bool', mask, [1, seqLen])

    const out = await decoderSession!.run({ x: xTensor, mask: maskTensor, context })
    const outTensor = out['output']
    const logits = outTensor.data as Float32Array
    // logits shape: [1, seqLen, decoderVocabSize] — decoder outputs 8000 logits
    const decoderVocabSize = outTensor.dims[2] as number
    const offset = (seqLen - 1) * decoderVocabSize
    const lastLogits = logits.subarray(offset, offset + decoderVocabSize)

    const nextToken = sampleToken(lastLogits, TEMPERATURE, TOP_K_THRES)
    if (nextToken === EOS_TOKEN) break
    tokens.push(nextToken)
  }

  return tokens.slice(1)  // drop BOS
}

function sampleToken(logits: Float32Array, temperature: number, thres: number): number {
  // top-k filter: keep top (1-thres) fraction
  const k = Math.max(1, Math.floor((1 - thres) * logits.length))

  // partial sort: get indices of top-k values
  const indices = Array.from({ length: logits.length }, (_, i) => i)
  indices.sort((a, b) => logits[b] - logits[a])
  const topK = indices.slice(0, k)

  // Apply temperature and softmax over top-k
  const vals = topK.map(i => logits[i] / temperature)
  const maxVal = Math.max(...vals)
  const exps = vals.map(v => Math.exp(v - maxVal))
  const sum = exps.reduce((a, b) => a + b, 0)
  const probs = exps.map(e => e / sum)

  // Sample (with near-zero temperature, this is argmax)
  let r = Math.random(), cumProb = 0
  for (let i = 0; i < topK.length; i++) {
    cumProb += probs[i]
    if (r < cumProb) return topK[i]
  }
  return topK[topK.length - 1]
}

function decodeTokens(tokens: number[]): string {
  const parts = tokens.map(id => {
    const tok = idToToken[id] ?? ''
    return tok
      .replace(/^Ġ/, ' ')   // BPE space prefix
      .replace(/^Ċ/, '\n')  // newline
  })
  return parts.join('').trim()
}

// ---- message handler ----

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data

  if (req.type === 'init') {
    try {
      await init()
      self.postMessage({ type: 'ready' } satisfies WorkerResponse)
    } catch (err) {
      console.error('[CalcInk worker] init failed:', err)
      self.postMessage({ type: 'loading', message: `Init error: ${err}` } satisfies WorkerResponse)
      // Post ready so the app doesn't hang; recognize calls will return an error
      self.postMessage({ type: 'ready' } satisfies WorkerResponse)
    }
    return
  }

  if (req.type === 'recognize') {
    if (!resizerSession || !encoderSession || !decoderSession) {
      const resp: WorkerResponse = { type: 'error', id: req.id, message: 'Models not loaded' }
      self.postMessage(resp)
      return
    }
    activeRequestId = req.id
    try {
      const latex = await recognize(req.imageData, req.id)
      // Only send if this request wasn't superseded mid-flight
      if (activeRequestId === req.id) {
        const resp: WorkerResponse = { type: 'result', id: req.id, latex }
        self.postMessage(resp)
      }
    } catch (err: any) {
      const msg = String(err)
      if (msg.includes('cancelled')) return  // silently drop superseded requests
      const resp: WorkerResponse = { type: 'error', id: req.id, message: msg }
      self.postMessage(resp)
    }
  }
}
