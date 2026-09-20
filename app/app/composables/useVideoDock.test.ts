import { describe, expect, it } from 'vitest'
import { clampRect } from './useVideoDock'

describe('clampRect', () => {
  it('leaves a rect that already fits untouched', () => {
    expect(clampRect({ x: 40, y: 40, w: 360, h: 203 }, 1440, 900))
      .toEqual({ x: 40, y: 40, w: 360, h: 203 })
  })

  it('pulls a rect back inside when it overhangs the right edge', () => {
    const r = clampRect({ x: 1400, y: 40, w: 360, h: 203 }, 1440, 900)
    expect(r.x + r.w).toBeLessThanOrEqual(1440)
    expect(r.x).toBeGreaterThanOrEqual(0)
  })

  it('pulls a rect back inside when it overhangs the bottom edge', () => {
    const r = clampRect({ x: 40, y: 880, w: 360, h: 203 }, 1440, 900)
    expect(r.y + r.h).toBeLessThanOrEqual(900)
  })

  it('handles a negative origin from a previous larger viewport', () => {
    const r = clampRect({ x: -200, y: -80, w: 360, h: 203 }, 1440, 900)
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
  })

  it('shrinks a rect wider than the viewport, preserving 16:9', () => {
    const r = clampRect({ x: 0, y: 0, w: 2000, h: 1125 }, 800, 600)
    expect(r.w).toBeLessThanOrEqual(800)
    expect(Math.abs(r.w / r.h - 16 / 9)).toBeLessThan(0.02)
  })

  it('never shrinks below the 240px minimum width', () => {
    const r = clampRect({ x: 0, y: 0, w: 100, h: 56 }, 1440, 900)
    expect(r.w).toBe(240)
  })
})
