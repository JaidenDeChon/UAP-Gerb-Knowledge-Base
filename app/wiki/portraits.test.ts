import { describe, expect, it } from 'vitest'
import { loadPortraits, parsePortraitManifest } from './portraits'

const entry = {
  request: 'Vannevar Bush',
  file: '/people/vannevar-bush.webp',
  width: 240,
  height: 301,
  source: 'https://commons.wikimedia.org/wiki/File:Vannevar_Bush_portrait.jpg',
  license: 'Public domain',
  licenseUrl: null,
  author: 'Harris & Ewing',
}

describe('parsePortraitManifest', () => {
  it('keys portraits by vault stem and keeps only what the site needs', () => {
    expect(parsePortraitManifest({ people: { 'Vannevar Bush': entry } })).toEqual({
      'People/Vannevar Bush': {
        src: '/people/vannevar-bush.webp',
        width: 240,
        height: 301,
        author: 'Harris & Ewing',
        license: 'Public domain',
        source: 'https://commons.wikimedia.org/wiki/File:Vannevar_Bush_portrait.jpg',
      },
    })
  })

  it('keeps an https licence link', () => {
    const out = parsePortraitManifest({ people: { X: { ...entry, licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0' } } })
    expect(out['People/X']?.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/3.0')
  })

  it('drops an entry that could not be credited or served safely', () => {
    const bad = [
      { ...entry, author: '' },
      { ...entry, license: '' },
      { ...entry, source: 'javascript:alert(1)' },
      { ...entry, file: 'https://upload.wikimedia.org/x.jpg' },
      { ...entry, file: '/people/../secret.webp' },
      { ...entry, width: 0 },
      null,
    ]
    const people = Object.fromEntries(bad.map((e, i) => [`P${i}`, e]))
    expect(parsePortraitManifest({ people })).toEqual({})
  })

  it('tolerates a missing or malformed manifest', () => {
    expect(parsePortraitManifest(null)).toEqual({})
    expect(parsePortraitManifest({})).toEqual({})
    expect(parsePortraitManifest({ people: 'nope' })).toEqual({})
  })
})

describe('loadPortraits', () => {
  it('reads the committed manifest, every file under /people/', () => {
    const portraits = loadPortraits()
    const entries = Object.entries(portraits)
    expect(entries.length).toBeGreaterThan(0)
    for (const [stem, p] of entries) {
      expect(stem.startsWith('People/')).toBe(true)
      expect(p.src.startsWith('/people/')).toBe(true)
      expect(p.source.startsWith('https://commons.wikimedia.org/')).toBe(true)
    }
  })
})
