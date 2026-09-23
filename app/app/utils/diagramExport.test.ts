import { describe, expect, it } from 'vitest'
import { exportFileName, fitScale, isTransparentColor, MAX_FILENAME_LENGTH, slugPart, wrapLines } from './diagramExport'

describe('slugPart', () => {
  it('lower-cases, strips accents and punctuation, and hyphenates', () => {
    expect(slugPart('UFO Legacy Programs - Science Applications International Corporation (SAIC)'))
      .toBe('ufo-legacy-programs-science-applications-international-corporation-saic')
    expect(slugPart('Área 51 & “Nellis”')).toBe('area-51-and-nellis')
    expect(slugPart('  --  ')).toBe('')
    expect(slugPart(undefined)).toBe('')
  })
})

describe('exportFileName', () => {
  it('joins the slugged parts with a double hyphen', () => {
    expect(exportFileName(['The Hidden Wing', 'US Air Force', 'org chart']))
      .toBe('the-hidden-wing--us-air-force--org-chart.png')
  })

  it('drops empty and repeated parts', () => {
    expect(exportFileName(['', 'SAIC', undefined, 'saic', 'org chart'])).toBe('saic--org-chart.png')
  })

  it('falls back to "diagram" and honours the extension', () => {
    expect(exportFileName([], 'jpg')).toBe('diagram.jpg')
    expect(exportFileName(['???'])).toBe('diagram.png')
  })

  it('trims long names at a hyphen', () => {
    const name = exportFileName(['word '.repeat(60), 'org chart'])
    const base = name.replace(/\.png$/, '')
    expect(base.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH)
    expect(base.endsWith('-')).toBe(false)
    expect(base.endsWith('word')).toBe(true)
  })
})

describe('wrapLines', () => {
  const measure = (s: string) => s.length

  it('wraps greedily at the width', () => {
    expect(wrapLines('one two three four', 9, measure)).toEqual(['one two', 'three', 'four'])
  })

  it('keeps an over-long word on its own line and collapses whitespace', () => {
    expect(wrapLines('  a   extraordinarily b ', 5, measure)).toEqual(['a', 'extraordinarily', 'b'])
  })

  it('returns nothing for blank text', () => {
    expect(wrapLines('   ', 10, measure)).toEqual([])
  })
})

describe('isTransparentColor', () => {
  it('recognises the transparent forms', () => {
    expect(isTransparentColor('transparent')).toBe(true)
    expect(isTransparentColor('rgba(0, 0, 0, 0)')).toBe(true)
    expect(isTransparentColor('rgb(0 0 0 / 0)')).toBe(true)
    expect(isTransparentColor('')).toBe(true)
    expect(isTransparentColor(undefined)).toBe(true)
  })

  it('treats opaque and partly transparent colours as painted', () => {
    expect(isTransparentColor('rgb(250, 250, 250)')).toBe(false)
    expect(isTransparentColor('rgba(10, 20, 30, 0.5)')).toBe(false)
    expect(isTransparentColor('oklch(0.2 0.01 250 / 0.8)')).toBe(false)
  })
})

describe('fitScale', () => {
  it('never enlarges a small diagram', () => {
    expect(fitScale(400, 300, 1200, 800)).toBe(1)
  })

  it('shrinks to the tighter axis', () => {
    expect(fitScale(2000, 500, 1000, 1000)).toBe(0.5)
    expect(fitScale(1000, 2000, 1000, 1000)).toBe(0.5)
  })

  it('stops at the minimum so a huge diagram scrolls instead', () => {
    expect(fitScale(10000, 500, 1000, 800)).toBe(0.4)
    expect(fitScale(10000, 500, 1000, 800, 0.25)).toBe(0.25)
  })

  it('is 1 when nothing has been measured yet', () => {
    expect(fitScale(0, 0, 1000, 800)).toBe(1)
  })
})
