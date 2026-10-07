# CalcInk — Product Requirements, Implementation Plan & Technical Architecture

**On-Device Handwritten Math Calculator | Tech Board Inter IIT Bootcamp — Phase 1 Software PS**  
**Date:** 7 October 2026  
**Status:** CoMER INT8 is the active model. Recognition is working end-to-end for arithmetic expressions.

## 1. Executive Summary

CalcInk is a 100% client-side handwritten arithmetic calculator. A user writes an expression with mouse, stylus, or touch; CalcInk captures digital ink, recognizes the expression, evaluates it using a deterministic parser, and projects the result.

CalcInk uses **CoMER INT8** (Coverage-guided Multi-scale Encoder-decoder, ECCV 2022), a model purpose-built for CROHME handwritten math recognition. Its INT8-quantized browser weights total **7.2 MB** (encoder 3.4 MB + decoder 4.0 MB), committed directly in the repo. Recognition emits LaTeX, which is normalized into CalcInk's strict arithmetic vocabulary and evaluated.

## 2. Product Requirements

### Functional
- Mouse/stylus/touch digital ink.
- Undo/redo, stroke eraser, clear, stroke width.
- High-DPI rendering using `devicePixelRatio`.
- Recognition vocabulary: `0–9`, `+`, `−`, `×`, `÷`, `.`, `(`, `)`, negative numbers, terminal `=`.
- Fully client-side, no network inference.
- BODMAS/PEMDAS evaluation including parenthesized sub-expressions.
- Multi-digit integers, decimals, negative numbers.
- Dynamic re-evaluation after editing.
- Division by zero → `Undefined`.
- Malformed syntax handled gracefully.
- Offline after assets have loaded/cached.

### Non-functional
- 60 FPS interaction target.
- Inference outside the UI thread (Web Worker).
- No `eval()`.
- Stable memory during long sessions.
- Reproducible model benchmark and attribution.

## 3. Architecture Choices

| Area | Options | Selection |
|---|---|---|
| Frontend | React+TS / Vue / Svelte / Vanilla TS | **React + TypeScript** |
| Rendering | Canvas 2D / SVG / WebGL | **Canvas 2D** |
| Recognition | Segmentation / image-to-LaTeX / stroke-to-LaTeX | **Stroke-to-LaTeX (CoMER)** |
| Model | RapidLatexOCR / TrOCR-LaTeX / CoMER | **CoMER INT8** |
| Runtime | ONNX Runtime Web / Transformers.js | **ONNX Runtime Web (direct)** |
| Execution | WebGPU / WASM | **WASM (numThreads=1)** |
| Inference location | Main thread / Worker | **Web Worker** |
| Worker input | ImageData / StrokeData | **StrokeData** (CROHME preprocessing in worker) |
| Evaluator | eval / shunting-yard / recursive descent | **Recursive descent** |
| Offline | Cache API / IndexedDB / both | **Service Worker + IndexedDB model cache** |

### Pipeline

```
strokes → StrokeData[] → worker → OffscreenCanvas render (CROHME style)
       → tensor + mask → ORT encoder → ORT decoder (greedy)
       → token IDs → vocab → LaTeX repair → raw LaTeX string
       → normalizer → arithmetic expression → parser → evaluator → result
```

## 4. Recognition Pipeline (detailed)

1. Capture pointer events → logical-coordinate strokes.
2. Render immediately (Canvas 2D, main thread).
3. Debounce recognition (600 ms).
4. Serialize strokes to `StrokeData[]` (strip color/id).
5. Send to worker via `postMessage`.
6. Worker: resample points at 3 px intervals, render with Bézier curves on OffscreenCanvas (white ink, black background — CROHME convention).
7. Scale to TARGET_H=128 px, dynamic width aligned to 64 px; emit `pixel_values` + `pixel_mask` tensors.
8. ORT encoder session → `encoder_features` + `encoder_mask`.
9. ORT decoder: greedy autoregressive decode from `<sos>` up to 50 steps.
10. Vocab decode → token string array; apply `repairLatex` (balance braces, fix `\frac`/`\sqrt` args).
11. `normalizeLatex`: map supported tokens, reject variables/fractions/roots/functions.
12. Recursive-descent parse → AST → evaluate.
13. Project result; reject stale responses via request ID.

## 5. LaTeX Normalization

The normalizer rejects unsupported constructs rather than execute arbitrary model output.

Supported:
- digits `0–9`, decimal point
- `+`, `-`, `−` (Unicode minus)
- `*`, `/`, `\times`, `\cdot`, `\div`, `×`, `÷`
- `(`, `)`
- terminal `=` (stripped before evaluation)

Rejected:
- variables (`a`–`z`, `A`–`Z`)
- `\frac`, `\sqrt`, `\int`, `\sum`, `\prod`, `\lim`
- trig/log functions
- Greek letters, `\pi`, `\infty`
- powers `^`, subscripts `_`, braces `{}`
- any unknown `\command`

## 6. Parser Grammar

```text
expression := term ((+ | -) term)*
term       := factor ((* | /) factor)*
factor     := ('-' factor) | '(' expression ')' | number
number     := DIGITS ['.' DIGITS] | '.' DIGITS
```

## 7. Model

### Active: CoMER INT8

Encoder-decoder HMER model trained on CROHME handwritten math data (ECCV 2022).
Source: [kimseungdae/ink-on](https://github.com/kimseungdae/ink-on) (MIT License).

| File | Size | Role |
|---|---|---|
| `encoder_int8.onnx` | 3.4 MB | DenseNet + Transformer visual encoder |
| `decoder_int8.onnx` | 4.0 MB | Autoregressive LaTeX decoder |
| `vocab.json` | ~4 KB | 113-token math vocabulary |

Benchmark (CROHME 2014, from ink-on):
- INT8 exact match: **36.4%** (vs 59.3% for the original 100 MB fp32 model)
- Within 2 edits: **65.8%**

### Previously evaluated

| Model | Outcome |
|---|---|
| RapidLatexOCR ONNX | 0/8 on browser benchmark — dropped |
| TrOCR-LaTeX (`onnx-community/latex_finetuned-ONNX`) | ~402 MB; ORT subgraph bug blocked loading — dropped |
| `Xenova/trocr-small-handwritten` | ORT subgraph error on merged decoder — dropped |

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

Measure: exact recognition accuracy, normalization success, cold init latency, warm inference latency, offline behavior.

**Decision:** CoMER INT8 is primary. Run the benchmark against actual handwritten samples before claiming a CalcInk accuracy figure.

## 9. Performance Architecture

- Main thread: input, Canvas 2D rendering, React state, result projection.
- Worker: preprocessing + ORT encoder/decoder inference.
- Debounce recognition (600 ms).
- Persistent ORT sessions (loaded once, reused).
- Request IDs for stale-result rejection.
- WASM with `numThreads=1` (no SharedArrayBuffer requirement).
- COOP/COEP headers set on dev server for forward compatibility.
- IndexedDB: model ArrayBuffers cached after first fetch — instant reload.

## 10. Implementation Plan

### Stage 0 — Repository + benchmark harness ✅
Set up React/TS/Vite, tests, benchmark interface and device baseline.

### Stage 1 — Digital ink core ✅
Pointer input, stroke store, Canvas 2D, DPR scaling.

### Stage 2 — Editing tools ✅
Undo/redo, clear, stroke eraser, stroke width.

### Stage 3 — Math engine ✅
Lexer, recursive-descent parser (with parentheses), AST, evaluator, precedence, decimals, negatives, division by zero.

### Stage 4 — Recognition abstraction ✅
Worker protocol (StrokeData), scheduler, request IDs, stale-result handling.

### Stage 5 — Handwritten OCR integration ✅
CoMER INT8 via direct ORT WASM in worker; CROHME-style OffscreenCanvas preprocessing; greedy decoder; vocab decode + LaTeX repair; normalize and evaluate.

### Stage 6 — Benchmark gate 🔄
Run benchmark against labeled handwritten samples; document accuracy and latency. (Typeset sanity harness exists; real handwriting samples not yet measured.)

### Stage 7 — Reactive recognition ✅
Connected: every stroke edit triggers debounced recognition and live result update.

### Stage 8 — Offline packaging 🔄
Service worker configured (VitePWA). IndexedDB model cache implemented. Airplane-mode verification pending.

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
    worker.ts             ORT WASM inference (CoMER encoder + decoder)
    preprocess.ts         OffscreenCanvas stroke → CROHME tensor + mask
    protocol.ts           StrokeData, WorkerRequest, WorkerResponse
    RecognitionManager.ts debounce, stroke serialization, callbacks
    latexNormalizer.ts    LaTeX → arithmetic token string
    latexRepair.ts        Decoder output post-processing
    modelCache.ts         IndexedDB ArrayBuffer cache
  math/
    lexer.ts
    parser.ts
    ast.ts
    evaluator.ts
  projection/
  benchmark/
  tests/
public/
  models/comer/           encoder_int8.onnx, decoder_int8.onnx, vocab.json
README.md
ARCHITECTURE.md
PLAN.md
```

## 12. Testing

- LaTeX normalization unit tests.
- Parser/evaluator unit tests (including parentheses, precedence, edge cases).
- Worker protocol and stale-result tests.
- Full write → recognize → evaluate → display E2E test.
- Edit → re-recognize → re-evaluate E2E test.
- Offline/airplane-mode E2E test.
- Performance and long-session memory tests.

## 13. Risks

| Risk | Mitigation |
|---|---|
| CoMER INT8 accuracy on real handwriting | Run CROHME-style handwritten benchmark; 36% exact match is a lower bound |
| Long or complex expressions | CoMER max decode steps = 50; test with long expressions |
| OffscreenCanvas unavailable | Supported in Chrome 69+, Firefox 105+, Safari 16.4+ — acceptable for modern PWA |
| ORT WASM compatibility | numThreads=1 avoids SharedArrayBuffer; tested on Chromium |
| Cache failure | IndexedDB fallback to direct fetch; service worker offline verification pending |

## 14. Definition of Done

- Required canvas features work.
- Recognition benchmark documented against handwritten samples.
- Safe normalization and deterministic evaluation work.
- Editing dynamically recomputes.
- Inference is off the main thread.
- No cloud inference.
- Offline mode works after initial caching.
- Automated tests pass.
- Model source/license/attribution documented.
- Public demo is reproducible.

## 15. Model Sources

- CoMER (original paper): https://arxiv.org/abs/2207.04463
- ink-on (CoMER ONNX + worker code): https://github.com/kimseungdae/ink-on (MIT)
- CROHME dataset: https://tc11.cvc.uab.es/datasets/CROHME

## Core Principle

> The ML model decides what the handwriting most likely represents; deterministic software decides whether that representation is valid CalcInk arithmetic and what the mathematical result is.
