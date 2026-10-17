import { describe, expect, it } from 'vitest'
import { reflowPage } from './documents-lib.mjs'

describe('reflowPage', () => {
  it('joins lines within a paragraph and keeps paragraph breaks', () => {
    expect(reflowPage('This Regulation establishes\nprocedures for reporting.\n\nIt applies to all\nAir Force activities.'))
      .toBe('This Regulation establishes procedures for reporting.\n\nIt applies to all Air Force activities.')
  })

  it('rejoins words hyphenated across a line break, but not real hyphens', () => {
    expect(reflowPage('approxi-\nmately 50 feet, a high-\nPowered set-up'))
      .toBe('approximately 50 feet, a high- Powered set-up')
  })

  it('drops form feeds and blank pages', () => {
    expect(reflowPage('\f')).toBe('')
  })
})
