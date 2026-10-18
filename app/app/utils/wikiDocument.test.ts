import { describe, expect, it } from 'vitest'
import { clampPage, findPageHeading, isPageHeading, normaliseBand, openingScrollTop, pageAt, stepZoom } from './wikiDocument'

describe('clampPage', () => {
  it('rounds and keeps the page within the document', () => {
    expect(clampPage(8, 20)).toBe(8)
    expect(clampPage(7.6, 20)).toBe(8)
    expect(clampPage(99, 20)).toBe(20)
    expect(clampPage(0, 20)).toBe(1)
    expect(clampPage(-3, 20)).toBe(1)
  })
  it('falls back to page 1 for anything that is not a number', () => {
    expect(clampPage(undefined, 5)).toBe(1)
    expect(clampPage('x', 5)).toBe(1)
    expect(clampPage('4', 5)).toBe(4)
  })
  it('leaves the page alone when the count is unknown', () => {
    expect(clampPage(42)).toBe(42)
  })
})

describe('normaliseBand', () => {
  it('accepts a band and clamps it to the page', () => {
    expect(normaliseBand([0.57, 0.77])).toEqual([0.57, 0.77])
    expect(normaliseBand([-0.2, 1.4])).toEqual([0, 1])
    expect(normaliseBand(['0.1', '0.5'])).toEqual([0.1, 0.5])
  })
  it('ignores missing, malformed, reversed or too-thin bands', () => {
    expect(normaliseBand(undefined)).toBeNull()
    expect(normaliseBand([])).toBeNull()
    expect(normaliseBand([0.5])).toBeNull()
    expect(normaliseBand(['a', 0.5])).toBeNull()
    expect(normaliseBand([0.6, 0.4])).toBeNull()
    expect(normaliseBand([0.5, 0.54])).toBeNull()
  })
})

describe('isPageHeading', () => {
  it('matches the page number exactly', () => {
    expect(isPageHeading('Page 8', 8)).toBe(true)
    expect(isPageHeading('  page 8 ', 8)).toBe(true)
    expect(isPageHeading('Page 8–9', 8)).toBe(true)
    expect(isPageHeading('Page 80', 8)).toBe(false)
    expect(isPageHeading('Page 18', 8)).toBe(false)
    expect(isPageHeading('Pages of note', 8)).toBe(false)
    expect(isPageHeading('Front page 8', 8)).toBe(false)
  })
})

describe('findPageHeading', () => {
  /** A minimal stand-in for a rendered DOM: just the two queries the helper makes. */
  function root(headings: { id?: string, text: string }[]): ParentNode {
    const els = headings.map(h => ({ id: h.id ?? '', textContent: h.text }))
    return {
      querySelector: (sel: string) => els.find(e => `h2#${e.id}` === sel) ?? null,
      querySelectorAll: () => els,
    } as unknown as ParentNode
  }

  it('prefers the slugged id', () => {
    const r = root([{ id: 'page-7', text: 'Page 7' }, { id: 'page-8', text: 'Page 8' }])
    expect((findPageHeading(r, 8) as unknown as { id: string }).id).toBe('page-8')
  })
  it('falls back to the heading text', () => {
    const r = root([{ id: 'p7', text: 'Page 7' }, { id: 'p8', text: 'Page 8' }])
    expect((findPageHeading(r, 8) as unknown as { id: string }).id).toBe('p8')
  })
  it('returns null when the page has no section', () => {
    expect(findPageHeading(root([{ text: 'Page 1' }]), 8)).toBeNull()
  })
})

describe('openingScrollTop', () => {
  it('opens at the page top, inside the padding', () => {
    expect(openingScrollTop({ pageTop: 2000, pageHeight: 900, frameHeight: 600 })).toBe(1984)
    expect(openingScrollTop({ pageTop: 16, pageHeight: 900, frameHeight: 600 })).toBe(0)
  })
  it('puts a band that fits a little above the middle', () => {
    // Band 0.5–0.6 of a 1000px page at 2000: 100px tall at 2500; room 500, half 250, capped at 30% (180).
    expect(openingScrollTop({ pageTop: 2000, pageHeight: 1000, frameHeight: 600, band: [0.5, 0.6] })).toBe(2320)
    // A band nearly the frame's height: centred.
    expect(openingScrollTop({ pageTop: 0, pageHeight: 1000, frameHeight: 600, band: [0.3, 0.8] })).toBe(250)
  })
  it('starts a band taller than the frame at its top', () => {
    expect(openingScrollTop({ pageTop: 1000, pageHeight: 1000, frameHeight: 400, band: [0.2, 0.9] })).toBe(1184)
  })
  it('never scrolls above the top', () => {
    expect(openingScrollTop({ pageTop: 16, pageHeight: 1000, frameHeight: 600, band: [0, 0.1] })).toBe(0)
  })
})

describe('pageAt', () => {
  const tops = [0, 16, 1016, 2016, 3016] // 1-based: page n's top is tops[n]
  const topOf = (n: number): number => tops[n]!
  it('finds the last page whose top is at or above the offset', () => {
    expect(pageAt(4, topOf, 0)).toBe(1)
    expect(pageAt(4, topOf, 1015)).toBe(1)
    expect(pageAt(4, topOf, 1016)).toBe(2)
    expect(pageAt(4, topOf, 99999)).toBe(4)
  })
  it('handles a long document', () => {
    expect(pageAt(412, n => (n - 1) * 1000, 300_500)).toBe(301)
  })
})

describe('stepZoom', () => {
  it('steps through the levels and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(3, 1)).toBe(3)
    expect(stepZoom(0.5, -1)).toBe(0.5)
  })
  it('snaps an off-step zoom to the next level in that direction', () => {
    expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(stepZoom(1.1, -1)).toBe(1)
    expect(stepZoom(5, -1)).toBe(3)
  })
})
