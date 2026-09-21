import { describe, expect, it } from 'vitest'
import { hasTocRail, splitAtFirstH2, tocLinks } from './content'

const h1 = ['h1', {}, 'Title']
const p = ['p', {}, 'Intro']
const h2 = ['h2', {}, 'Maps of Content']
const ul = ['ul', {}, ['li', {}, 'One']]

describe('splitAtFirstH2', () => {
  it('splits at the first h2, keeping the heading with the rest', () => {
    expect(splitAtFirstH2({ value: [p, h2, ul] })).toEqual({ intro: [p], rest: [h2, ul] })
  })

  it('splits at the FIRST h2 only', () => {
    const second = ['h2', {}, 'Later']
    expect(splitAtFirstH2({ value: [h2, p, second] }).intro).toEqual([])
  })

  it('treats a body with no h2 as all intro', () => {
    expect(splitAtFirstH2({ value: [h1, p] })).toEqual({ intro: [h1, p], rest: [] })
  })

  it('survives an empty or malformed body', () => {
    expect(splitAtFirstH2(undefined)).toEqual({ intro: [], rest: [] })
    expect(splitAtFirstH2({ value: [] })).toEqual({ intro: [], rest: [] })
  })
})

describe('tocLinks', () => {
  const toc = {
    links: [
      { id: 'a', depth: 2, text: 'A', children: [{ id: 'a1', depth: 3, text: 'A1' }] },
      { id: 'b', depth: 2, text: 'B' },
    ],
  }

  it('keeps the h2 spine and drops everything nested under it', () => {
    expect(tocLinks(toc).map(l => l.id)).toEqual(['a', 'b'])
  })

  it('needs three h2s before a rail exists', () => {
    expect(hasTocRail(toc)).toBe(false)
    expect(hasTocRail({ links: [...toc.links, { id: 'c', depth: 2, text: 'C' }] })).toBe(true)
  })

  it('survives an empty or missing toc', () => {
    expect(tocLinks(undefined)).toEqual([])
    expect(hasTocRail(null)).toBe(false)
  })
})
