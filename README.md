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
# Download ONNX models (one-time, ~170 MB)
npm run download-models   # see below
npm run dev
```

### Model download

The ONNX model files are not in the repository. Download them manually or run:

```powershell
$base = "https://huggingface.co/inYourOwnBrowser/rapid-latex-ocr-onnx/resolve/main"
foreach ($f in @("image_resizer.onnx","encoder.onnx","decoder.onnx","tokenizer.json")) {
    Invoke-WebRequest "$base/$f" -OutFile "public/models/$f"
}
```

Files go in `public/models/`.

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

- **RapidLatexOCR ONNX** — `inYourOwnBrowser/rapid-latex-ocr-onnx` on Hugging Face  
  Original: [RapidAI/RapidLaTeXOCR](https://github.com/RapidAI/RapidLaTeXOCR)  
  Based on: [LaTeX-OCR / pix2tex](https://github.com/lukas-blecher/LaTeX-OCR) by Lukas Blecher  
  ONNX conversion: [SWHL/ConvertLaTeXOCRToONNX](https://github.com/SWHL/ConvertLaTeXOCRToONNX)  
  **License: MIT**

- **ONNX Runtime Web** — Microsoft Corporation  
  **License: MIT**

## Core principle

> The ML model decides what the handwriting most likely represents; deterministic software decides whether that representation is valid CalcInk arithmetic and what the mathematical result is.
