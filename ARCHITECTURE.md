# CalcInk — Architecture

## Pipeline

```
Pointer Events (mouse / stylus / touch)
     │
     ▼
Canvas Controller (useCanvasController.ts)
  • pen / stroke-eraser tool state
  • stroke width / color
     │
     ▼
Stroke Store (StrokeStore.ts)
  • ordered list of strokes (logical coordinates)
  • full undo/redo stack
     │
     ├──► Canvas Renderer (renderer.ts)
     │     • renderStrokes → Canvas 2D with DPR scaling
     │
     └──► Recognition Scheduler (RecognitionManager.ts)
           • 600 ms debounce
           • request ID for stale-result rejection
           • maps Stroke[] → StrokeData[] (strips color/id)
           │
           ▼ postMessage (StrokeData[])
     Web Worker (worker.ts)
           │
           ▼
     CoMER Preprocessor (preprocess.ts)
           • resample points at 3 px intervals
           • render with quadratic Bézier curves
           • CROHME convention: white ink, black background
           • scale content to TARGET_H=128 px, top-left aligned
           • dynamic canvas width aligned to 64 px (MIN 128, MAX 1024)
           • emit pixel_values tensor [1,1,256,W] + pixel_mask [1,256,W]
           │
           ▼
     ONNX Encoder (encoder_int8.onnx — 3.4 MB)
           • DenseNet + Transformer visual feature extractor
           • input: pixel_values, pixel_mask
           • output: encoder_features, encoder_mask
           │
           ▼
     ONNX Decoder — greedy decode (decoder_int8.onnx — 4.0 MB)
           • autoregressive token generation
           • repeat-token guard (limit 3)
           • max 50 steps
           │
           ▼
     Vocab Decode + LaTeX Repair (latexRepair.ts)
           • idx2word lookup → token string array
           • balance braces, fix \frac / \sqrt argument counts
           │
           ▼ postMessage result
     LaTeX Normalizer (latexNormalizer.ts)
           • \times → *,  \div / ÷ → /,  − → -,  ( ) passthrough
           • rejects: variables, fractions, roots, functions,
             powers, unknown commands
           │
           ▼
     Recursive-Descent Parser (parser.ts)
           • grammar: expression → term ((+ | -) term)*
           •          term      → factor ((* | /) factor)*
           •          factor    → ('-' factor) | '(' expression ')' | number
           │
           ▼
     Deterministic Evaluator (evaluator.ts)
           • BODMAS / PEMDAS
           • decimals, unary minus, parentheses
           • division by zero → { ok:false, error:'division_by_zero' }
           │
           ▼
     Result Projection (ResultDisplay.tsx)
           • number → formatted string (12 sig-fig cap)
           • division by zero → "Undefined"
           • rejected/malformed → error state
```

## Execution model

| Thread | Responsibility |
|---|---|
| Main | Pointer input, Canvas 2D rendering, React state, result display |
| Web Worker | CoMER preprocessing, ORT WASM encoder + decoder inference |

Inference never blocks the UI thread.

## Key design decisions

| Decision | Rationale |
|---|---|
| Stroke-to-LaTeX via CoMER | Purpose-built HMER model trained on CROHME handwritten-math data; 7.2 MB INT8 vs ~400 MB for TrOCR |
| Strokes sent to worker (not ImageData) | CROHME-correct preprocessing (white-on-black, Bézier smoothing, dynamic sizing) happens inside the worker using OffscreenCanvas |
| Strict LaTeX normalizer | Model output is general LaTeX; normalizer enforces CalcInk's arithmetic grammar and rejects anything evaluable incorrectly |
| No `eval()` | Security: deterministic recursive-descent parser instead |
| Debounce 600 ms | Prevents inference spam while writing; balances responsiveness |
| Request ID cancellation | Newer results supersede older in-flight recognition results |
| IndexedDB model cache | Model ArrayBuffers cached on first load; subsequent loads are instant, no re-download |
| Service Worker + Cache API | Offline after first load; static assets and ORT WASM cached |
| Strokes as source of truth | Bitmap is a view; strokes enable re-render, eraser, high-DPI, and correct CROHME-style preprocessing |
| COOP / COEP headers | Required for SharedArrayBuffer (ORT threaded WASM); set in dev server and production |

## Model

**CoMER INT8** (Coverage-guided Multi-scale Encoder-decoder, ECCV 2022), adapted from
[kimseungdae/ink-on](https://github.com/kimseungdae/ink-on) (MIT License).

| File | Size | Role |
|---|---|---|
| `public/models/comer/encoder_int8.onnx` | 3.4 MB | DenseNet + Transformer visual encoder |
| `public/models/comer/decoder_int8.onnx` | 4.0 MB | Autoregressive LaTeX token decoder |
| `public/models/comer/vocab.json` | ~4 KB | Token vocabulary (word2idx / idx2word) |

Model weights are bundled in the repo and served from `/models/comer/`. Inference runs
entirely in WASM and does not send user data over the network.

## Repository structure

```
src/
  app/            App shell, routing, CSS
  canvas/         InkCanvas component, renderer, eraser
  ink/            StrokeStore, types (Stroke, Point, BoundingBox)
  math/           lexer, parser, AST, evaluator
  projection/     ResultDisplay
  recognition/
    worker.ts         ORT WASM inference worker (CoMER encoder + decoder)
    preprocess.ts     OffscreenCanvas stroke → tensor + mask
    protocol.ts       WorkerRequest / WorkerResponse types, StrokeData
    RecognitionManager.ts  debounce, request IDs, stroke serialization
    latexNormalizer.ts     LaTeX → arithmetic token string
    latexRepair.ts         Post-process decoder output (brace balance, \frac args)
    modelCache.ts          IndexedDB-backed ArrayBuffer cache
  benchmark/      BenchmarkPage, test expressions, synthetic stroke renderer
  tests/          Unit and integration tests
public/
  models/comer/   CoMER ONNX weights + vocab (committed)
```
