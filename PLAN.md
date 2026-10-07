# CalcInk — Updated Product Requirements, Implementation Plan & Technical Architecture

**On-Device Handwritten Math Calculator | Tech Board Inter IIT Bootcamp — Phase 1 Software PS**  
**Date:** 7 October 2026  
**Status:** Updated design baseline. RapidLatexOCR ONNX is the primary candidate, subject to the benchmark gate.

## 1. Executive Summary

CalcInk is a 100% client-side handwritten arithmetic calculator. A user writes an expression with mouse, stylus, or touch; CalcInk captures digital ink, recognizes the expression, evaluates it using a deterministic parser, and projects the result beside the terminal equals sign.

After the Hugging Face model survey, the primary candidate is **RapidLatexOCR ONNX**. It is browser-oriented, ONNX-based, recognizes handwritten/typeset math formulas, and emits LaTeX. The major engineering risks are its approximately **179 MB** package size and the need to normalize general LaTeX output into CalcInk's strict arithmetic vocabulary.

## 2. Product Requirements

### Functional
- Mouse/stylus/touch digital ink.
- Undo/redo, stroke eraser, pixel eraser, clear, stroke width.
- High-DPI rendering using `devicePixelRatio`.
- Recognition vocabulary: `0–9`, `+`, `−`, `×`, `÷`, `.`, negative numbers, terminal `=`.
- Existing open-source pretrained model, fully client-side.
- BODMAS/PEMDAS evaluation.
- Multi-digit integers, decimals, negative numbers.
- Dynamic re-evaluation after editing.
- Division by zero → `Undefined`.
- Malformed syntax handled gracefully.
- Offline after assets have loaded/cached.

### Non-functional
- 60 FPS interaction target.
- Heavy inference outside the UI thread.
- No `eval()`.
- Stable memory during long sessions.
- Reproducible model benchmark and attribution.

## 3. Architecture Choices Before Decisions

| Area | Options | Selection |
|---|---|---|
| Frontend | React+TS / Vue / Svelte / Vanilla TS | **React + TypeScript** |
| Rendering | Canvas 2D / SVG / WebGL-WebGPU | **Canvas 2D** |
| Recognition | Segmentation / image-to-LaTeX / math OCR | **Image-to-LaTeX** |
| Primary model | RapidLatexOCR / TrOCR-LaTeX / other HMER | **RapidLatexOCR ONNX**, benchmark-gated |
| Runtime | ONNX Runtime Web / Transformers.js / TF.js | **ONNX Runtime Web** |
| Execution | WebGPU / WASM | **WebGPU + WASM fallback** |
| Inference location | Main thread / Worker | **Web Worker** |
| Evaluator | eval / shunting-yard / recursive descent | **Recursive descent** |
| Offline | Cache API / IndexedDB / both | **Service Worker + Cache API; IndexedDB as needed** |

### Important model-specific decision

RapidLatexOCR is **image-to-LaTeX**, so the architecture is not:

`strokes → symbols`

It is:

`strokes → expression image crop → ONNX model → LaTeX → strict arithmetic normalization → parser → evaluator`

## 4. Updated Architecture

```text
Pointer Events
     ↓
Canvas Controller → Canvas Renderer
     ↓
Stroke Store / History
     ↓
Recognition Scheduler
     ↓
Recognition Manager
     ↓ postMessage
Web Worker
     ↓
Expression Crop + Rasterization
     ↓
ONNX Runtime Web
     ↓
RapidLatexOCR
     ↓
LaTeX Decoder
     ↓
Strict Arithmetic Normalizer
     ↓
Recursive-Descent Parser / AST
     ↓
Deterministic Evaluator
     ↓
Result Projection beside "="
```

### Why strokes remain the source of truth

The rendered bitmap is only a view. Structured strokes are required for erasing, editing, re-rendering, recognition snapshots and high-DPI correctness.

## 5. Recognition Pipeline

1. Capture pointer events.
2. Store logical-coordinate strokes.
3. Render immediately.
4. Debounce recognition.
5. Snapshot current strokes.
6. Compute expression bounding box + padding.
7. Rasterize only the crop.
8. Send image data to the worker.
9. Run ONNX preprocessing/model inference.
10. Decode LaTeX.
11. Normalize supported LaTeX into CalcInk arithmetic tokens.
12. Validate strict grammar.
13. Parse/evaluate.
14. Project answer.
15. Reject stale results using request IDs.

## 6. LaTeX Normalization

The normalizer must reject unsupported constructs rather than execute arbitrary model output.

Supported output should reduce to:
- digits
- decimal point
- unary minus
- `+`
- `-`
- multiplication
- division
- terminal equals

Reject:
- variables
- powers
- fractions
- roots
- functions
- matrices
- unsupported LaTeX commands
- unknown tokens

Recommended internal grammar:

```text
expression := term ((+ | -) term)*
term       := factor ((* | /) factor)*
factor     := ('-' factor) | number
number     := DIGITS ['.' DIGITS] | '.' DIGITS
```

The visible `=` is a delimiter and is not evaluated.

## 7. Model Recommendation

### Primary: RapidLatexOCR ONNX

Hugging Face describes `inYourOwnBrowser/rapid-latex-ocr-onnx` as a re-hosted, unmodified ONNX copy of RapidAI/RapidLatexOCR for handwritten/typeset math formulas, usable fully client-side with `onnxruntime-web`. It contains `image_resizer.onnx`, `encoder.onnx`, `decoder.onnx`, and `tokenizer.json`, with about **179 MB** of files and an **MIT** license.

**Pros**
- Browser-oriented ONNX package.
- Math-specific.
- Handwritten/typeset formula recognition.
- Direct fit for ONNX Runtime Web.
- MIT license.

**Cons**
- ~179 MB is substantial for a web app.
- Output is general LaTeX rather than CalcInk's tiny arithmetic grammar.
- Must benchmark warm/cold latency and memory.
- Long-expression behavior must be measured.

### Secondary: TrOCR-LaTeX ONNX

`onnx-community/latex_finetuned-ONNX` is an ONNX version of `tjoab/latex_finetuned`, a TrOCR model fine-tuned on Google's MathWriting dataset. Its model card reports **14.9% CER** and warns that very long expressions degrade.

Use it as the primary fallback benchmark, not as an assumed winner.

## 8. Benchmark Gate

Required expressions:

```text
18+4×3=
12.5÷2=
-5+12=
100-25×2=
3.14×2=
8÷0=
18+4×3-2.5=
100.0÷4-7.25=
```

Measure:
- exact recognition accuracy
- token accuracy
- normalization success
- cold initialization
- warm inference latency
- peak memory
- WebGPU latency
- WASM latency
- long-expression behavior
- offline behavior
- integration difficulty
- license/attribution requirements

**Decision rule:** RapidLatexOCR remains primary only if it passes the browser feasibility gate. Otherwise benchmark/select TrOCR-LaTeX ONNX.

## 9. Performance Architecture

- Main thread: input, rendering, state and projection.
- Worker: preprocessing + model inference.
- Debounce recognition.
- Persistent worker/model session.
- Request IDs for stale-result rejection.
- WebGPU where available, WASM fallback.
- Small expression crop rather than full-canvas inference.
- Transfer buffers/ImageBitmap where practical.
- Measure frame time separately from inference time.

## 10. Implementation Plan

### Stage 0 — Repository + benchmark harness
Set up React/TS/Vite, tests, benchmark interface and device baseline.

### Stage 1 — Digital ink core
Pointer input, stroke store, Canvas 2D, DPR scaling.

### Stage 2 — Editing tools
Undo/redo, clear, stroke eraser, pixel eraser, stroke width.

### Stage 3 — Math engine
Lexer, recursive-descent parser, AST, evaluator, precedence, decimals, negatives, division by zero.

### Stage 4 — Recognition abstraction
Worker protocol, scheduler, request IDs, stale-result handling.

### Stage 5 — RapidLatexOCR integration
ONNX assets, preprocessing, crop generation, decoding, LaTeX normalization.

### Stage 6 — Benchmark gate
Compare RapidLatexOCR and TrOCR-LaTeX ONNX; document measured decision.

### Stage 7 — Reactive recognition
Connect edits to recognition and result projection.

### Stage 8 — Offline packaging
Service worker, model/static caching, airplane-mode verification.

### Stage 9 — Performance hardening
Profile frame time, latency, memory and repeated inference.

### Stage 10 — UX polish
Digital-paper aesthetic, micro-interactions, error/status feedback.

### Stage 11 — Verification
Unit, integration and E2E tests, offline test, long-session test.

### Stage 12 — Submission
README, model attribution, architecture, benchmark results, clean Git history, public demo.

## 11. Repository Structure

```text
src/
  app/
  canvas/
  ink/
  recognition/
    RecognitionManager.ts
    worker.ts
    protocol.ts
    preprocess.ts
    latexNormalizer.ts
  math/
    lexer.ts
    parser.ts
    ast.ts
    evaluator.ts
  projection/
  offline/
  benchmark/
  tests/
public/
  models/
README.md
ARCHITECTURE.md
PRD.md
```

## 12. Testing

- Canvas coordinate/DPR tests.
- Stroke history/eraser tests.
- LaTeX normalization tests.
- Parser/evaluator tests.
- Worker protocol and stale-result tests.
- Full write → recognize → evaluate → display E2E test.
- Edit → re-recognize → re-evaluate E2E test.
- Offline/airplane-mode E2E test.
- Performance and long-session memory tests.

## 13. Risks

| Risk | Mitigation |
|---|---|
| 179 MB model too large | Benchmark memory/download; compare fallback |
| General LaTeX output | Strict normalizer + grammar |
| Long expression accuracy | Benchmark representative expressions |
| UI lag | Worker + debounce + persistent session |
| WebGPU unavailable | WASM fallback |
| Stale results | request IDs |
| Cache failure | offline E2E verification |

## 14. Definition of Done

- Required canvas features work.
- Recognition benchmark is documented.
- Safe normalization and deterministic evaluation work.
- Editing dynamically recomputes.
- Inference is off the main thread.
- No cloud inference.
- Offline mode works after initial caching.
- Automated tests pass.
- Model source/license/attribution are documented.
- Public demo is reproducible.

## 15. Model Sources

- RapidLatexOCR ONNX: https://huggingface.co/inYourOwnBrowser/rapid-latex-ocr-onnx
- TrOCR-LaTeX ONNX: https://huggingface.co/onnx-community/latex_finetuned-ONNX
- Original TrOCR-LaTeX: https://huggingface.co/tjoab/latex_finetuned
- TrOCR documentation: https://huggingface.co/docs/transformers/main/model_doc/trocr

## Core Principle

> The ML model decides what the handwriting most likely represents; deterministic software decides whether that representation is valid CalcInk arithmetic and what the mathematical result is.
