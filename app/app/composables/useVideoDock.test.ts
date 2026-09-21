import { describe, expect, it } from 'vitest'
import { clampRect, defaultRect } from './useVideoDock'

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
    expect(r.h).toBe(135)
  })

  it('binds on height for a normal viewport, preserving 16:9', () => {
    const r = clampRect({ x: 0, y: 0, w: 1000, h: 563 }, 1200, 300)
    expect(r.y + r.h).toBeLessThanOrEqual(300)
    expect(Math.abs(r.w / r.h - 16 / 9)).toBeLessThan(0.02)
  })

  it('returns the minimum-size rect at the origin for a zero-height viewport', () => {
    const r = clampRect({ x: 40, y: 40, w: 360, h: 203 }, 1440, 0)
    expect(r).toEqual({ x: 0, y: 0, w: 240, h: 135 })
    expect(Number.isFinite(r.w)).toBe(true)
    expect(Number.isFinite(r.h)).toBe(true)
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThan(0)
  })

  it('returns the minimum-size rect at the origin for a zero-width viewport', () => {
    const r = clampRect({ x: 40, y: 40, w: 360, h: 203 }, 0, 900)
    expect(r).toEqual({ x: 0, y: 0, w: 240, h: 135 })
    expect(Number.isFinite(r.w)).toBe(true)
    expect(Number.isFinite(r.h)).toBe(true)
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThan(0)
  })

  it('shrinks below the 240px preference when the viewport itself is narrower', () => {
    const r = clampRect({ x: 0, y: 0, w: 384, h: 216 }, 200, 400)
    expect(r.x + r.w).toBeLessThanOrEqual(200)
  })
})

describe('defaultRect', () => {
  it('opens a first-time dock in the bottom-right corner with a 24px margin', () => {
    const r = defaultRect(1440, 900)
    expect(r.w).toBe(384)
    expect(r.x + r.w).toBe(1440 - 24)
    expect(r.y + r.h).toBe(900 - 24)
  })

  it('still fits a viewport too small for the margin', () => {
    const r = defaultRect(320, 400)
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.x + r.w).toBeLessThanOrEqual(320)
    expect(r.y + r.h).toBeLessThanOrEqual(400)
  })
})
