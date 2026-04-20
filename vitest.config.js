import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config({ path: '.env.test' })

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    fileParallelism: false,
    include: ['src/__tests__/**/*.test.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,ts}'],
      exclude: ['src/__tests__/**', 'src/index.js'],
    },
  },
})
