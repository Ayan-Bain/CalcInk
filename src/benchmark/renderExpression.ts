// Render a math expression string to an ImageData for benchmark inference.
// Uses canvas text rendering with a monospace font to approximate typeset input.

export function renderExpressionToImageData(
  text: string,
  targetWidth = 512,
  targetHeight = 128,
): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')!

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  // Black text, sized to fit
  ctx.fillStyle = '#000000'
  const fontSize = Math.min(targetHeight * 0.6, 48)
  ctx.font = `${fontSize}px 'Courier New', monospace`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, targetWidth / 2, targetHeight / 2)

  return ctx.getImageData(0, 0, targetWidth, targetHeight)
}
