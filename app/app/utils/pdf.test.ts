import { describe, expect, it } from 'vitest'
import { canvasScale } from './pdf'

describe('canvasScale', () => {
  it('uses the screen density, capped at 2', () => {
    expect(canvasScale(600, 800, 1)).toBe(1)
    expect(canvasScale(600, 800, 2)).toBe(2)
    expect(canvasScale(600, 800, 3)).toBe(2)
    expect(canvasScale(600, 800, 0)).toBe(1)
  })
  it('draws fewer pixels when the canvas would be too large', () => {
    const s = canvasScale(2400, 3100, 2, 16_000_000)
    expect(s).toBeLessThan(2)
    expect(2400 * s * 3100 * s).toBeCloseTo(16_000_000, -3)
  })
})
