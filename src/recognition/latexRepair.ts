// Post-process CoMER decoder output to fix common structural errors.
// Adapted from kimseungdae/ink-on (MIT)

export function repairLatex(tokens: string[]): string[] {
  let result = [...tokens]
  result = balanceBraces(result)
  result = fixFracArgs(result)
  result = fixSqrtArgs(result)
  return result
}

function balanceBraces(tokens: string[]): string[] {
  const result: string[] = []
  let depth = 0
  for (const t of tokens) {
    if (t === '{') { depth++; result.push(t) }
    else if (t === '}') { if (depth > 0) { depth--; result.push(t) } }
    else result.push(t)
  }
  while (depth-- > 0) result.push('}')
  return result
}

function fixFracArgs(tokens: string[]): string[] {
  const result: string[] = []
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] !== '\\frac') { result.push(tokens[i]!); i++; continue }
    result.push(tokens[i]!); i++
    let groups = 0
    while (i < tokens.length && groups < 2) {
      if (tokens[i] === '{') {
        groups++; let depth = 1; result.push(tokens[i]!); i++
        while (i < tokens.length && depth > 0) {
          if (tokens[i] === '{') depth++; else if (tokens[i] === '}') depth--
          result.push(tokens[i]!); i++
        }
      } else { result.push(tokens[i]!); i++; groups++ }
    }
    // drop extra braced groups
    while (i < tokens.length && tokens[i] === '{') {
      let depth = 1; i++
      while (i < tokens.length && depth > 0) {
        if (tokens[i] === '{') depth++; else if (tokens[i] === '}') depth--; i++
      }
    }
  }
  return result
}

function fixSqrtArgs(tokens: string[]): string[] {
  const result: string[] = []
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] !== '\\sqrt') { result.push(tokens[i]!); i++; continue }
    result.push(tokens[i]!); i++
    let groups = 0
    while (i < tokens.length && groups < 1) {
      if (tokens[i] === '{') {
        groups++; let depth = 1; result.push(tokens[i]!); i++
        while (i < tokens.length && depth > 0) {
          if (tokens[i] === '{') depth++; else if (tokens[i] === '}') depth--
          result.push(tokens[i]!); i++
        }
      } else { result.push(tokens[i]!); i++; groups++ }
    }
    while (i < tokens.length && tokens[i] === '{') {
      let depth = 1; i++
      while (i < tokens.length && depth > 0) {
        if (tokens[i] === '{') depth++; else if (tokens[i] === '}') depth--; i++
      }
    }
  }
  return result
}
