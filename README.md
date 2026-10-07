# CalcInk

**On-device handwritten arithmetic calculator** — Tech Board Inter IIT Bootcamp Phase 1 Software PS

Draw any arithmetic expression ending with `=` using mouse, stylus, or touch. CalcInk recognises the handwriting with a fully client-side ONNX model, evaluates the result deterministically, and projects the answer beside the equals sign. No data leaves your device.

## Features

- Freehand ink capture with pressure-sensitive stroke width
- Undo / redo / stroke eraser / clear
- BODMAS/PEMDAS evaluation — multi-digit integers, decimals, negative numbers
- Division by zero → Undefined
- Offline after initial model load (PWA, Service Worker + Cache API)
- Recognition benchmark harness (Stage 6 tab)

## Running locally

```bash
npm install
npm run dev
```

The first model load downloads about **402 MiB** from Hugging Face. Transformers.js caches
the model in the browser; subsequent loads can use the cached files, including offline.
Images are processed locally and are never uploaded.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build + service worker |
| `npm test` | Vitest unit tests |
| `npm run test:coverage` | Coverage report |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full pipeline diagram and design decisions.

## Model attribution

- **TrOCR-LaTeX ONNX** — [`onnx-community/latex_finetuned-ONNX`](https://huggingface.co/onnx-community/latex_finetuned-ONNX)  
  Fine-tuned by `tjoab` on Google's MathWriting handwritten-math dataset; loaded with the
  `q4` quantized weights via Transformers.js. The model card reports 14.9% character error
  rate on its evaluation set; this is not a CalcInk accuracy guarantee.
  **License: MIT**

- **Transformers.js** — Hugging Face  
  **License: Apache-2.0**

- **ONNX Runtime Web** — Microsoft Corporation
  **License: MIT**

## Core principle

> The ML model decides what the handwriting most likely represents; deterministic software decides whether that representation is valid CalcInk arithmetic and what the mathematical result is.
