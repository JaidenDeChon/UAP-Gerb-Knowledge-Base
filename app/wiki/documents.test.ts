import { describe, expect, it } from 'vitest'
import { frontmatterScalars, joinDocument, parseDocumentFrontmatter, parseDocumentManifest } from './documents'

const file = {
  url: 'https://example.supabase.co/storage/v1/object/public/documents/' + 'a'.repeat(64) + '.pdf',
  sha256: 'a'.repeat(64),
  bytes: 119716,
  pages: 1,
  thumb: { src: '/documents/hottel-memo.webp', width: 240, height: 311 },
  fetchedFrom: 'https://vault.fbi.gov/hottel_guy/Guy%20Hottel%20Part%2001%20(Final)/at_download/file',
  retrieved: '2026-10-15',
}

describe('frontmatterScalars', () => {
  it('reads top-level scalars, unquoted, and skips lists', () => {
    const raw = '---\nname: "Hottel Memo"\ntags:\n  - document\ndate: 1950-03-22\nissuer: \'FBI\'\n---\nBody'
    expect(frontmatterScalars(raw)).toEqual({ name: 'Hottel Memo', date: '1950-03-22', issuer: 'FBI' })
  })

  it('returns nothing without frontmatter', () => {
    expect(frontmatterScalars('Just a body')).toEqual({})
  })
})

describe('parseDocumentFrontmatter', () => {
  it('keeps known values and drops unknown ones', () => {
    expect(parseDocumentFrontmatter({
      date: '1950-03-22',
      issuer: 'Federal Bureau of Investigation',
      doc_kind: 'memo',
      provenance: 'official',
      rights: 'public-domain',
      source_url: 'https://vault.fbi.gov/hottel_guy',
    })).toEqual({
      date: '1950-03-22',
      issuer: 'Federal Bureau of Investigation',
      kind: 'memo',
      provenance: 'official',
      rights: 'public-domain',
      source: 'https://vault.fbi.gov/hottel_guy',
    })
    expect(parseDocumentFrontmatter({ provenance: 'genuine', rights: 'free', source_url: 'http://insecure.example' })).toEqual({})
  })
})

describe('parseDocumentManifest', () => {
  it('keeps a complete entry, keyed by page title', () => {
    expect(parseDocumentManifest({ documents: { 'Hottel Memo': file } })).toEqual({ 'Hottel Memo': file })
  })

  it('drops an entry with a missing or malformed field', () => {
    for (const bad of [
      { ...file, sha256: 'nothex' },
      { ...file, url: 'http://example.com/x.pdf' },
      { ...file, pages: 0 },
      { ...file, thumb: { ...file.thumb, src: '/elsewhere/x.webp' } },
      { ...file, retrieved: 'yesterday' },
    ]) {
      expect(parseDocumentManifest({ documents: { X: bad } })).toEqual({})
    }
    expect(parseDocumentManifest(null)).toEqual({})
  })
})

describe('joinDocument', () => {
  it('attaches the file only when the rights allow hosting', () => {
    expect(joinDocument({ rights: 'public-domain' }, file)).toEqual({ rights: 'public-domain', file })
    expect(joinDocument({ rights: 'open-licence' }, file).file).toEqual(file)
    expect(joinDocument({ rights: 'unclear' }, file)).toEqual({ rights: 'unclear' })
    expect(joinDocument({ rights: 'copyrighted' }, file)).toEqual({ rights: 'copyrighted' })
    expect(joinDocument({}, file)).toEqual({})
  })
})
