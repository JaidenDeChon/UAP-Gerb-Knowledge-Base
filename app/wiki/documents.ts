import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// Relative rather than the `#shared` alias — see the note in ./graph.ts.
import type { DocumentFile, DocumentProvenance, DocumentRights, NoteDocument } from '../shared/types/wiki'
import { stemToPath, VAULT_DIR } from './vault'

/**
 * Primary-source documents.
 *
 * A Documents note describes one document in its frontmatter, checked by hand:
 *
 *   date: "1950-03-22"
 *   issuer: "Federal Bureau of Investigation"
 *   doc_kind: memo
 *   provenance: official        # official | leaked | disputed
 *   rights: public-domain       # public-domain | open-licence | copyrighted | unclear
 *   source_url: "https://vault.fbi.gov/…"
 *
 * `scripts/fetch-documents.mjs` downloads the PDF from `source_url` (or a
 * Wayback copy of it), uploads it to the site's Supabase bucket under its
 * SHA-256, renders page 1 into `public/documents/`, and records the file in
 * `wiki/documents.json`, keyed by page title. The bake joins the two here.
 *
 * Only a document whose `rights` allow it is ever shown with its file. A
 * manifest entry for anything else is dropped, so a mistaken upload can't
 * reach the page.
 */

const PROVENANCE = new Set<DocumentProvenance>(['official', 'leaked', 'disputed'])
const RIGHTS = new Set<DocumentRights>(['public-domain', 'open-licence', 'copyrighted', 'unclear'])
/** Rights under which the site hosts a copy. */
export const HOSTABLE = new Set<DocumentRights>(['public-domain', 'open-licence'])

const HTTP_RE = /^https:\/\/\S+$/
const THUMB_RE = /^\/documents\/[a-z0-9-]+\.webp$/
const SHA_RE = /^[0-9a-f]{64}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** The manifest beside this module (resolved like `VAULT_DIR`, see ./vault.ts). */
function manifestPath(): string {
  const candidates = [
    resolve(process.cwd(), 'wiki/documents.json'),
    fileURLToPath(new URL('./documents.json', import.meta.url)),
  ]
  return candidates.find(existsSync) ?? candidates[0]!
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

/**
 * The frontmatter's top-level `key: value` scalars, quotes stripped. Lists and
 * nested blocks are skipped: every document field is a scalar.
 */
export function frontmatterScalars(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!match) return out
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_]+):\s*(.+)$/.exec(line)
    if (!kv) continue
    let value = kv[2]!.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1).trim()
    }
    if (value) out[kv[1]!] = value
  }
  return out
}

/** A Documents note's frontmatter as document facts. Unknown values are dropped. */
export function parseDocumentFrontmatter(fm: Record<string, string>): NoteDocument {
  const doc: NoteDocument = {}
  if (fm.date) doc.date = fm.date
  if (fm.issuer) doc.issuer = fm.issuer
  if (fm.doc_kind) doc.kind = fm.doc_kind
  if (PROVENANCE.has(fm.provenance as DocumentProvenance)) doc.provenance = fm.provenance as DocumentProvenance
  if (RIGHTS.has(fm.rights as DocumentRights)) doc.rights = fm.rights as DocumentRights
  if (fm.source_url && HTTP_RE.test(fm.source_url)) doc.source = fm.source_url
  return doc
}

/**
 * Validates the manifest's `documents` map into `{ "<page title>": file }`.
 * An entry with any field missing or malformed is dropped. Pure, so it's
 * unit-tested directly.
 */
export function parseDocumentManifest(raw: unknown): Record<string, DocumentFile> {
  const out: Record<string, DocumentFile> = {}
  const documents = (raw as { documents?: unknown } | null)?.documents
  if (!documents || typeof documents !== 'object') return out
  for (const [title, entry] of Object.entries(documents as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const thumb = (e.thumb ?? {}) as Record<string, unknown>
    const url = str(e.url)
    const sha256 = str(e.sha256)
    const bytes = positive(e.bytes)
    const pages = positive(e.pages)
    const src = str(thumb.src)
    const width = positive(thumb.width)
    const height = positive(thumb.height)
    const fetchedFrom = str(e.fetchedFrom)
    const retrieved = str(e.retrieved)
    if (!title.trim() || !HTTP_RE.test(url) || !SHA_RE.test(sha256) || !bytes || !pages) continue
    if (!THUMB_RE.test(src) || !width || !height || !HTTP_RE.test(fetchedFrom) || !DAY_RE.test(retrieved)) continue
    out[title.trim()] = { url, sha256, bytes, pages, thumb: { src, width, height }, fetchedFrom, retrieved, ...(str(e.ocr) ? { ocr: true } : {}), ...(str(e.built) === 'page-images' ? { fromImages: true } : {}) }
  }
  return out
}

/** Joins a note's facts with its manifest entry, keeping the file only when its rights allow it. */
export function joinDocument(facts: NoteDocument, file: DocumentFile | undefined): NoteDocument {
  return file && facts.rights && HOSTABLE.has(facts.rights) ? { ...facts, file } : facts
}

function loadManifest(): Record<string, DocumentFile> {
  try {
    return parseDocumentManifest(JSON.parse(readFileSync(manifestPath(), 'utf8')))
  }
  catch {
    return {}
  }
}

/** The vault stem of a document's transcription (see docs/documents.md, "Transcriptions"). */
export function transcriptionStem(title: string): string {
  return `Documents/Transcriptions/${title} (Transcription)`
}

/** Document facts and file, keyed by vault stem (`Documents/Hottel Memo`), for every Documents note. */
export function loadDocuments(stems: string[]): Record<string, NoteDocument> {
  const manifest = loadManifest()
  const all = new Set(stems)
  const out: Record<string, NoteDocument> = {}
  for (const stem of stems) {
    if (!stem.startsWith('Documents/') || stem.startsWith('Documents/Transcriptions/')) continue
    let raw: string
    try {
      raw = readFileSync(`${VAULT_DIR}/${stem}.md`, 'utf8')
    }
    catch {
      continue
    }
    const title = stem.slice('Documents/'.length)
    const doc = joinDocument(parseDocumentFrontmatter(frontmatterScalars(raw)), manifest[title])
    const transcription = transcriptionStem(title)
    if (all.has(transcription)) doc.transcription = stemToPath(transcription)
    out[stem] = doc
  }
  return out
}
