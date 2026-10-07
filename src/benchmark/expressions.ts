// Required benchmark expressions from PLAN.md §8
export interface BenchmarkCase {
  id: string
  display: string          // human-readable (unicode operators)
  normalized: string       // what the normalizer should produce
  expectedValue: number | 'undefined'
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  { id: 'b1', display: '18+4×3=',       normalized: '18+4*3=',       expectedValue: 30 },
  { id: 'b2', display: '12.5÷2=',       normalized: '12.5/2=',       expectedValue: 6.25 },
  { id: 'b3', display: '-5+12=',         normalized: '-5+12=',         expectedValue: 7 },
  { id: 'b4', display: '100-25×2=',     normalized: '100-25*2=',     expectedValue: 50 },
  { id: 'b5', display: '3.14×2=',       normalized: '3.14*2=',       expectedValue: 6.28 },
  { id: 'b6', display: '8÷0=',          normalized: '8/0=',          expectedValue: 'undefined' },
  { id: 'b7', display: '18+4×3-2.5=',   normalized: '18+4*3-2.5=',   expectedValue: 27.5 },
  { id: 'b8', display: '100.0÷4-7.25=', normalized: '100.0/4-7.25=', expectedValue: 17.75 },
]
