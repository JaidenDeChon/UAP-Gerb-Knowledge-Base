import { describe, expect, it } from 'vitest'
import { splitAtFirstH2 } from './content'

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
