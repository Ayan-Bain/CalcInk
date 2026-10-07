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
           │
           ▼ postMessage (ImageData)
     Web Worker (worker.ts)
           │
           ▼
     Transformers.js image-to-text pipeline
           • TrOCR fine-tuned on handwritten MathWriting data
           • q4 quantized ONNX weights, WASM execution
           • model files cached by the browser after first load
           │
           ▼ BPE decoding (Ġ→space)
     Raw LaTeX string
           │
           ▼ postMessage result
     LaTeX Normalizer (latexNormalizer.ts)
           • \times → *,  \div → /,  − → -
           • rejects: variables, fractions, roots, functions, unknown commands
           │
           ▼
     Recursive-Descent Parser (parser.ts)
           • grammar: expression → term ((+|-) term)*
           •          term → factor ((*|/) factor)*
           •          factor → ('-' factor) | number
           │
           ▼
     Deterministic Evaluator (evaluator.ts)
           • BODMAS / PEMDAS
           • decimals, unary minus
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
| Web Worker | Transformers.js ONNX image-to-text inference |

Inference never blocks the UI thread.

## Key design decisions

| Decision | Rationale |
|---|---|
| Image-to-LaTeX instead of stroke segmentation | Uses a MathWriting-finetuned model for handwritten expressions |
| Strict LaTeX normalizer | Model output is general LaTeX; normalizer enforces CalcInk's arithmetic grammar |
| No `eval()` | Security: deterministic recursive-descent parser instead |
| Debounce 600 ms | Prevents inference spam while writing; balances responsiveness |
| Request ID cancellation | Newer results supersede older in-flight recognition results |
| Service Worker + Cache API | Offline after first load; model files cached with CacheFirst strategy |
| Strokes as source of truth | Bitmap is a view; strokes enable re-render, eraser, high-DPI |

## Model

**TrOCR-LaTeX ONNX** (`onnx-community/latex_finetuned-ONNX`), fine-tuned on Google's
MathWriting handwritten-math dataset.

| Quantized model file | Size | Role |
|---|---|---|
| `encoder_model_q4.onnx` | ~55 MiB | Vision encoder |
| `decoder_model_q4.onnx` | ~347 MiB | Autoregressive text decoder |
| tokenizer and processor configuration | small | Image and LaTeX token processing |

The reported total download is about 402 MiB. Model weights are fetched from Hugging Face
and cached in the browser; inference uses WASM and does not send user images over the network.

## Repository structure

```
src/
  app/            App shell, routing, CSS
  canvas/         InkCanvas component, renderer, eraser
  ink/            StrokeStore, types (Stroke, Point, BoundingBox)
  recognition/    RecognitionManager, worker, latexNormalizer
  math/           lexer, parser, AST, evaluator
  projection/     ResultDisplay
  benchmark/      BenchmarkPage, test expressions, expression renderer
  tests/          Unit and integration tests
public/
  models/         Legacy RapidLatexOCR assets (gitignored)
```
