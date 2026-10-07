import { describe, it, expect } from 'vitest'
import { BENCHMARK_CASES } from '../benchmark/expressions'
import { evaluate } from '../math/evaluator'

// Verify that the evaluator alone gives correct results for all benchmark cases,
// independent of recognition. This is the deterministic half of the benchmark gate.
describe('benchmark — evaluator correctness', () => {
  for (const bc of BENCHMARK_CASES) {
    it(`${bc.display} → ${bc.expectedValue}`, () => {
      const result = evaluate(bc.normalized)
      if (bc.expectedValue === 'undefined') {
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toBe('division_by_zero')
      } else {
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.value).toBeCloseTo(bc.expectedValue as number, 5)
      }
    })
  }
})
