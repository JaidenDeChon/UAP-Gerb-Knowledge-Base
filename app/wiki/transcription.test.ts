import { describe, expect, it } from 'vitest'
import { escapeEditorialBrackets, isTranscriptionFile } from './transcription'

describe('escapeEditorialBrackets', () => {
  it('escapes editorial marks', () => {
    expect(escapeEditorialBrackets('the controling [sic] mechanism, SA [redacted]'))
      .toBe('the controling \\[sic\\] mechanism, SA \\[redacted\\]')
  })

  it('escapes nested marks from the inside out', () => {
    expect(escapeEditorialBrackets('*[stamp: INDEXED - [illegible]]*'))
      .toBe('*\\[stamp: INDEXED - \\[illegible\\]\\]*')
  })

  it('leaves Markdown links alone', () => {
    expect(escapeEditorialBrackets('of the [Hottel Memo](</wiki/documents/hottel-memo>), [t]est'))
      .toBe('of the [Hottel Memo](</wiki/documents/hottel-memo>), \\[t\\]est')
  })

  it('is idempotent', () => {
    const once = escapeEditorialBrackets('sauc[ers] [word?]')
    expect(escapeEditorialBrackets(once)).toBe(once)
  })
})

describe('isTranscriptionFile', () => {
  it('matches only files under Documents/Transcriptions', () => {
    expect(isTranscriptionFile('wiki/Documents/Transcriptions/Hottel Memo (Transcription).md')).toBe(true)
    expect(isTranscriptionFile('wiki/Documents/Hottel Memo.md')).toBe(false)
  })
})
