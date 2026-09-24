// Pure helpers behind scripts/fetch-people-images.mjs: no network, no disk,
// so they are unit-tested directly (people-images-lib.test.ts).

/**
 * Commons' `LicenseShortName` values we accept: CC0, CC BY and CC BY-SA (any
 * version, ported or not), public domain marks, "No restrictions" (the
 * Flickr Commons mark) and Commons' plain "Attribution" licence (free use on
 * condition of credit). Anything else, including a fair-use rationale,
 * "All rights reserved", a GFDL-only file or a missing value, is skipped.
 */
export const FREE_LICENSE = /^(?:CC0(?: 1\.0)?|CC BY(?:-SA)? \d\.\d(?: [a-z-]+)?|CC BY(?:-SA)?|Public domain|PD(?:[- ].*)?|No restrictions|Attribution)$/i

/** Licences that don't legally require naming the author. */
const NO_ATTRIBUTION = /^(?:CC0|Public domain|PD|No restrictions)/i

/** Commons' HTML metadata values as plain text. */
export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, '\'').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tidies a Commons `Artist` field into a short credit line. The field is free
 * text: it repeats itself ("Unknown author Unknown author"), carries labels
 * ("Author: …"), uploader boilerplate ("The original uploader was X at
 * English Wikipedia."), parenthetical notes, or a whole sentence. An empty
 * result means "no usable author".
 */
export function cleanAuthor(raw) {
  let s = stripHtml(raw)
  s = s.replace(/^(?:author|photographer|photo|by)\s*:\s*/i, '')
  s = s.replace(/\s+(?:video title|title|source|description)\s*:.*$/i, '')
  s = s.replace(/\s*\([^()]*\)/g, '')
  // A link after a name ("Max Moszkowicz https://…") is the name's source,
  // not part of it. A bare link is dropped below.
  s = s.replace(/(\S)\s+https?:\/\/\S+/gi, '$1')
  s = s.replace(/\s+/g, ' ').replace(/[\s.,;]+$/, '').trim()
  const uploader = /^The original uploader was (.+?) at (.+)$/i.exec(s)
  if (uploader) s = `${uploader[1]} (${uploader[2].trim()})`
  // "Unknown author Unknown author" and similar exact repeats.
  const words = s.split(' ')
  if (words.length % 2 === 0) {
    const half = words.length / 2
    if (words.slice(0, half).join(' ') === words.slice(half).join(' ')) s = words.slice(0, half).join(' ')
  }
  if (/^(?:not stated|unknown|unknown author|anonymous|n\/a)$/i.test(s)) return ''
  if (/^https?:\/\//i.test(s)) return ''
  // A sentence rather than a name: keep its first clause.
  if (s.length > 48) s = s.split(/,|\s+took\s+|\s+-\s+/)[0].trim()
  if (s.length > 80) s = `${s.slice(0, 77).trimEnd()}…`
  return s
}

/**
 * Checks a Commons file's `extmetadata`; returns the credit to record, or
 * `{ skip: reason }`.
 */
export function vetLicense(extmetadata) {
  const meta = extmetadata ?? {}
  const value = key => stripHtml(meta[key]?.value)
  const nonFree = value('NonFree')
  if (nonFree && nonFree !== 'false') return { skip: 'flagged non-free' }
  const license = value('LicenseShortName')
  if (!license) return { skip: 'no licence recorded' }
  if (!FREE_LICENSE.test(license)) return { skip: `licence not free or not recognised (${license})` }
  const author = cleanAuthor(meta.Artist?.value) || cleanAuthor(meta.Credit?.value)
  if (!author && !NO_ATTRIBUTION.test(license)) {
    return { skip: `no author for a licence that requires attribution (${license})` }
  }
  return {
    license,
    licenseUrl: value('LicenseUrl') || null,
    author: author || 'Unknown author',
  }
}

/** A page title as a file name: "Stephanie O'Sullivan" -> "stephanie-o-sullivan". */
export function slugify(title) {
  return String(title).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Every `name:` inside the `::wiki-roster` blocks of one note's text. */
export function rosterNames(text) {
  const out = []
  for (const block of String(text).matchAll(/^::wiki-roster[^\n]*\n([\s\S]*?)^::\s*$/gm)) {
    for (const m of block[1].matchAll(/^\s*-\s*name:\s*(["']?)(.+?)\1\s*$/gm)) out.push(m[2].trim())
  }
  return out
}
