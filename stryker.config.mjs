/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/types.ts',
  ],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress'],
  thresholds: { high: 80, low: 60, break: null },
  incremental: true,
  incrementalFile: '.stryker-incremental.json',
  plugins: ['@stryker-mutator/vitest-runner'],
  disableTypeChecks: 'src/**/*.ts',
  concurrency: 4,
  timeoutMS: 10_000,
  timeoutFactor: 1.5,
  ignoreStatic: true,
}
