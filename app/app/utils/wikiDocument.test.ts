import { describe, expect, it } from 'vitest'
import { clampPage, findPageHeading, isPageHeading, normaliseBand } from './wikiDocument'

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
