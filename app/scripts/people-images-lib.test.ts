import { describe, expect, it } from 'vitest'
// @ts-expect-error -- a plain-JS build script module, no type declarations.
import { cleanAuthor, FREE_LICENSE, rosterNames, slugify, vetLicense } from './people-images-lib.mjs'

const meta = (fields: Record<string, string>) =>
  Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, { value }]))

describe('FREE_LICENSE', () => {
  it.each([
    'CC BY-SA 4.0',
    'CC BY 2.0',
    'CC BY-SA 3.0 de',
    'CC0',
    'Public domain',
    'PD-US',
    'No restrictions',
    'Attribution',
  ])('accepts %s', (license) => {
    expect(FREE_LICENSE.test(license)).toBe(true)
  })

  it.each(['Fair use', 'All rights reserved', 'CC BY-NC 2.0', 'CC BY-ND 4.0', 'GFDL', ''])('rejects %s', (license) => {
    expect(FREE_LICENSE.test(license)).toBe(false)
  })
})

describe('cleanAuthor', () => {
  it('strips HTML and collapses whitespace', () => {
    expect(cleanAuthor('<a href="//commons.wikimedia.org/wiki/User:A.Savin">A.Savin</a>')).toBe('A.Savin')
  })

  it('collapses an exact repeat', () => {
    expect(cleanAuthor('Unknown author Unknown author')).toBe('')
    expect(cleanAuthor('Harris &amp; Ewing Harris &amp; Ewing')).toBe('Harris & Ewing')
  })

  it('drops labels, trailing fields and parentheticals', () => {
    expect(cleanAuthor('Author: Max Moszkowicz Video title: Lue Elizondo interview')).toBe('Max Moszkowicz')
    expect(cleanAuthor('U.S. House Subcommittee (screenshot from a broadcast)')).toBe('U.S. House Subcommittee')
  })

  it('drops a link that follows a name, and a bare link entirely', () => {
    expect(cleanAuthor('Max Moszkowicz https://www.youtube.com/@moszkowiczshow')).toBe('Max Moszkowicz')
    expect(cleanAuthor('http://www.jcs.mil/bios/twining.pdf')).toBe('')
  })

  it('rewrites uploader boilerplate', () => {
    expect(cleanAuthor('The original uploader was Fdavis99 at English Wikipedia .')).toBe('Fdavis99 (English Wikipedia)')
  })

  it('keeps the first clause of a sentence', () => {
    expect(cleanAuthor('Linda Wells, wife of Lin Wells, took this image for his Bio page at https://en.wikipedia.org/wiki/Linton_Wells_II')).toBe('Linda Wells')
  })

  it('treats placeholders as no author', () => {
    expect(cleanAuthor('Not stated.')).toBe('')
    expect(cleanAuthor(undefined)).toBe('')
  })
})

describe('vetLicense', () => {
  it('returns the credit for a free, attributed file', () => {
    expect(vetLicense(meta({
      LicenseShortName: 'CC BY-SA 3.0',
      LicenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      Artist: 'A.Savin',
    }))).toEqual({ license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0', author: 'A.Savin' })
  })

  it('credits an unknown author on a public-domain file', () => {
    expect(vetLicense(meta({ LicenseShortName: 'Public domain', Artist: 'Unknown author' })))
      .toEqual({ license: 'Public domain', licenseUrl: null, author: 'Unknown author' })
  })

  it('falls back to Credit when Artist is unusable', () => {
    expect(vetLicense(meta({ LicenseShortName: 'CC BY 2.0', Artist: 'Not stated', Credit: 'Peabody Awards' })).author).toBe('Peabody Awards')
  })

  it('skips a licence that needs attribution but names nobody', () => {
    expect(vetLicense(meta({ LicenseShortName: 'CC BY 4.0' }))).toHaveProperty('skip')
  })

  it('skips non-free, unrecognised and missing licences', () => {
    expect(vetLicense(meta({ LicenseShortName: 'CC BY-SA 4.0', NonFree: 'true', Artist: 'X' }))).toHaveProperty('skip')
    expect(vetLicense(meta({ LicenseShortName: 'Fair use', Artist: 'X' }))).toHaveProperty('skip')
    expect(vetLicense(meta({ Artist: 'X' }))).toHaveProperty('skip')
    expect(vetLicense(undefined)).toHaveProperty('skip')
  })
})

describe('slugify', () => {
  it('makes a file-safe name', () => {
    expect(slugify('Stephanie O\'Sullivan')).toBe('stephanie-o-sullivan')
    expect(slugify('George E. Brown Jr.')).toBe('george-e-brown-jr')
    expect(slugify('Richard Carrión')).toBe('richard-carrion')
  })
})

describe('rosterNames', () => {
  it('reads every name in every roster block, and nothing outside them', () => {
    const text = [
      '::wiki-roster',
      '---',
      'entries:',
      '  - name: "David Grusch"',
      '    role: "Whistleblower"',
      '  - name: Ben Rich',
      '---',
      '::',
      '',
      '::wiki-chain',
      '---',
      'steps:',
      '  - name: "Not A Roster Entry"',
      '---',
      '::',
      '::wiki-roster',
      '---',
      'entries:',
      '  - name: \'Vannevar Bush\'',
      '---',
      '::',
    ].join('\n')
    expect(rosterNames(text)).toEqual(['David Grusch', 'Ben Rich', 'Vannevar Bush'])
  })
})
