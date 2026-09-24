import { describe, expect, it } from 'vitest'
import { portraitAlt, portraitCredit } from './portrait'

describe('portraitAlt', () => {
  it('names the person', () => {
    expect(portraitAlt(' David Grusch ')).toBe('Portrait of David Grusch')
    expect(portraitAlt('')).toBe('Portrait')
  })
})

describe('portraitCredit', () => {
  it('credits author, licence and source', () => {
    expect(portraitCredit({ author: 'A.Savin', license: 'CC BY-SA 3.0' }))
      .toBe('Photo: A.Savin · CC BY-SA 3.0 · Wikimedia Commons')
  })

  it('leaves out an unknown author', () => {
    expect(portraitCredit({ author: 'Unknown author', license: 'Public domain' }))
      .toBe('Photo · Public domain · Wikimedia Commons')
  })
})
