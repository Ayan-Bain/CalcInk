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
     Preprocessing (preprocess.ts)
           • RGBA → grayscale
           • auto-crop to ink bounding box
           • pad to multiples of 32
           • minmax size (max 672 × 192)
           │
           ▼ image_resizer.onnx loop (≤10 iterations)
     Image Resizer
           • predicts optimal width
           • iterates until convergence
           │
           ▼ encoder.onnx
     Encoder (Swin Transformer ViT)
           • input: float32 [1, 1, H, W]
           • output: context tensor
           │
           ▼ decoder.onnx autoregressive loop
     Decoder (miniature GPT-2)
           • inputs: x (int64), mask (bool), context (float32)
           • top-k sampling (thres=0.9) + temperature=0.00001 (greedy)
           • max 64 tokens (sufficient for arithmetic)
           • cancellation check every step
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
| Web Worker | All ONNX inference (preprocessing → resizer → encoder → decoder) |

Inference never blocks the UI thread.

## Key design decisions

| Decision | Rationale |
|---|---|
| Image-to-LaTeX instead of stroke segmentation | Leverages pre-trained model; avoids building a symbol segmenter |
| Strict LaTeX normalizer | Model output is general LaTeX; normalizer enforces CalcInk's arithmetic grammar |
| No `eval()` | Security: deterministic recursive-descent parser instead |
| `MAX_SEQ = 64` | Arithmetic expressions are short; 512 wastes decoder round-trips |
| Debounce 600 ms | Prevents inference spam while writing; balances responsiveness |
| Cancellation in decoder loop | New stroke during long inference abandons the stale result |
| Service Worker + Cache API | Offline after first load; model files cached with CacheFirst strategy |
| Strokes as source of truth | Bitmap is a view; strokes enable re-render, eraser, high-DPI |

## Model

**RapidLatexOCR ONNX** (`inYourOwnBrowser/rapid-latex-ocr-onnx`)

| File | Size | Role |
|---|---|---|
| `image_resizer.onnx` | 37 MB | Predicts optimal image width |
| `encoder.onnx` | 85 MB | Swin Transformer ViT encoder |
| `decoder.onnx` | 49 MB | Autoregressive GPT-2-style decoder |
| `tokenizer.json` | 24 KB | BPE vocabulary (1174 tokens) |

Tensor interfaces confirmed from [SWHL/ConvertLaTeXOCRToONNX](https://github.com/SWHL/ConvertLaTeXOCRToONNX):
- `image_resizer`: input `"input"` → output `"output"`
- `encoder`: input `"input"` → output `"output"`
- `decoder`: inputs `"x"` (int64), `"mask"` (bool), `"context"` (float32) → output `"output"` [batch, seq, 8000]

## Repository structure

```
src/
  app/            App shell, routing, CSS
  canvas/         InkCanvas component, renderer, eraser
  ink/            StrokeStore, types (Stroke, Point, BoundingBox)
  recognition/    RecognitionManager, worker, preprocess, latexNormalizer
  math/           lexer, parser, AST, evaluator
  projection/     ResultDisplay
  benchmark/      BenchmarkPage, test expressions, expression renderer
  tests/          Unit and integration tests
public/
  models/         ONNX model files (gitignored, download separately)
  ort-wasm/       ONNX Runtime Web WASM files
```
