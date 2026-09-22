import { describe, expect, it } from 'vitest'
import { formatDay, formatRuntime } from './video'

describe('formatRuntime', () => {
  it('formats hours and minutes without a 60m remainder', () => {
    expect(formatRuntime(9829)).toBe('2h 44m')
    expect(formatRuntime(7190)).toBe('2h 0m')
    expect(formatRuntime(2280)).toBe('38m')
  })
  it('is null for missing or zero runtimes', () => {
    expect(formatRuntime(0)).toBeNull()
    expect(formatRuntime(null)).toBeNull()
  })
})

describe('formatDay', () => {
  it('formats in UTC', () => {
    expect(formatDay('2026-07-10T23:59:00.000Z')).toBe('Jul 10, 2026')
    expect(formatDay(null)).toBeNull()
    expect(formatDay('nope')).toBeNull()
  })
})
