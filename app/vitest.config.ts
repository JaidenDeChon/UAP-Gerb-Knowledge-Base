import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['wiki/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
})
