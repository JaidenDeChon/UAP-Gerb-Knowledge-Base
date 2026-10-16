// Archives the PDFs of vault Documents notes in the site's Supabase bucket,
// offline, and records each one in wiki/documents.json for the build to bake.
// Documented in docs/documents.md.
//
//   node scripts/fetch-documents.mjs init                create the public bucket
//   node scripts/fetch-documents.mjs fetch [targets]     download, OCR, render, upload
//   node scripts/fetch-documents.mjs check [targets]     report what's missing
//   node scripts/fetch-documents.mjs text "Title" [N-M]  print a hosted file's text, page by page
//   node scripts/fetch-documents.mjs page "Title" N      render page N to a PNG to read by eye
//   node scripts/fetch-documents.mjs lookup <url>        list the Wayback captures under a URL
//   node scripts/fetch-documents.mjs probe <url>         download a candidate PDF and show what it is
//   node scripts/fetch-documents.mjs draft "Title" [N-M] start a transcription from the text layer
//
// Targets: every Documents note (default), or page titles as arguments
// ("Hottel Memo" "Robertson Panel Report").
//
// Nothing is guessed. A document is fetched only when its note's frontmatter
// carries a `source_url:` someone has checked is the issuer's own copy of this
// exact document, and `rights: public-domain` or `rights: open-licence`. A note
// may add `fetch_url:` for a direct PDF link when `source_url` is a landing
// page. `fetch`, for each such note:
//   1. downloads `fetch_url` or `source_url`. When the site refuses scripts (a
//      403 from a .gov or .mil CDN is common) it asks the Wayback Machine for
//      the newest capture of that URL and downloads the original bytes from
//      there (`id_`), recording which it used;
//   2. checks the bytes are a PDF and reads the page count with `pdfinfo`;
//   2b. adds a text layer with `ocrmypdf` when the file has little or none (a
//      scan), so the viewer's text is selectable and `text` has something to
//      print. `ocr: redo` on the note throws away a poor existing OCR layer
//      and OCRs the scan afresh (ocrmypdf `--force-ocr`, which re-renders each
//      page as an image, so use it only on pure scans); `ocr: off` skips OCR.
//      Otherwise the page images are never altered (no deskew, no rotation,
//      no optimisation). The OCR'd file is the one hosted; the manifest keeps
//      the hash of the file as downloaded too;
//   3. renders page 1 (or `thumb_page:`, for a file that opens on a FOIA cover
//      sheet) with `pdftoppm` and re-encodes it to a 320px-wide WebP
//      (`cwebp`) under `public/documents/<slug>.webp`, for hover cards and the
//      viewer's stand-in;
//   4. uploads the PDF to the `documents` bucket as `<sha256>.pdf`, so a file
//      never changes under its name and can be cached for a year;
//   5. records url, hash, size, pages, thumbnail, where it came from and when
//      in `wiki/documents.json`, keyed by page title.
// A note already in the manifest, with its thumbnail on disk and its
// `source_url` unchanged, is skipped without any request. `--force` redoes it.
//
// `text` and `page` exist for transcribing (see "Transcriptions" in
// docs/documents.md): they print the raw OCR text and render a page image to
// check it against. `lookup` helps find a source on a site that refuses
// scripts.
//
// Needs poppler (pdfinfo, pdftoppm, pdftotext), cwebp and ocrmypdf
// (`brew install poppler webp ocrmypdf`), and SUPABASE_URL plus
// SUPABASE_SERVICE_ROLE_KEY in the environment or in app/.env.local (never
// committed). The service-role key can write to storage; it stays on the
// machine that runs this script and is never sent to the site.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reflowPage } from './documents-lib.mjs'
import { slugify } from './people-images-lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP = resolve(__dirname, '..')
const VAULT = resolve(APP, '../UAP Gerb Knowledge Base')
const DOCS_DIR = resolve(VAULT, 'Documents')
const OUT_DIR = resolve(APP, 'public/documents')
const MANIFEST = resolve(APP, 'wiki/documents.json')
const CACHE = resolve(__dirname, '.cache/documents')

const BUCKET = 'documents'
const USER_AGENT = 'UAPGerbKnowledgeBase-DocumentFetcher/1.0 (https://github.com/JaidenDeChon/UAP-Gerb-Knowledge-Base; offline build script, run by hand)'
const MIN_INTERVAL_MS = 1100
const THUMB_WIDTH = 320
const HOSTABLE = new Set(['public-domain', 'open-licence'])
/** Supabase's own per-file ceiling on the free plan; raise it with the plan. */
const MAX_BYTES = 50 * 1024 * 1024

/* ------------------------------------------------------------- args -- */

const [command = 'fetch', ...rest] = process.argv.slice(2)
const flags = new Set(rest.filter(a => a.startsWith('--')))
const names = rest.filter(a => !a.startsWith('--'))
if (!['init', 'fetch', 'check', 'text', 'page', 'lookup', 'probe', 'draft'].includes(command)) {
  console.error('Usage: node scripts/fetch-documents.mjs <init|fetch|check|text|page|lookup|probe|draft> ["Page title" ...] [--force]')
  process.exit(1)
}

/* -------------------------------------------------------------- env -- */

function loadEnv() {
  const file = resolve(APP, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const kv = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (kv && !process.env[kv[1]]) process.env[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, '$2')
  }
}

function supabase() {
  loadEnv()
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in the environment or app/.env.local).')
    process.exit(1)
  }
  return { url, key }
}

/* ------------------------------------------------------------ vault -- */

/** The frontmatter's simple `key: value` scalars (quotes stripped). */
function frontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  const out = {}
  if (!match) return out
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_]+):\s*(.+)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  return out
}

function readDocument(title) {
  const file = resolve(DOCS_DIR, `${title}.md`)
  if (!existsSync(file)) return null
  const fm = frontmatter(readFileSync(file, 'utf8'))
  return {
    title,
    source: fm.source_url ?? '',
    fetchUrl: fm.fetch_url ?? '',
    rights: fm.rights ?? '',
    thumbPage: Math.max(1, Number.parseInt(fm.thumb_page ?? '1', 10) || 1),
    ocr: ['redo', 'off'].includes(fm.ocr) ? fm.ocr : 'auto',
  }
}

function targets() {
  if (names.length) return names
  if (!existsSync(DOCS_DIR)) return []
  return readdirSync(DOCS_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  }
  catch {
    return { documents: {} }
  }
}

/**
 * Records one document's entry. The manifest is read again just before the
 * write and only this entry changes, so runs fetching different documents at
 * the same time don't overwrite each other's results.
 */
function saveEntry(title, entry) {
  const manifest = readManifest()
  manifest.documents ??= {}
  manifest.documents[title] = entry
  writeManifest(manifest)
}

function writeManifest(manifest) {
  const sorted = Object.fromEntries(Object.entries(manifest.documents).sort(([a], [b]) => a.localeCompare(b)))
  const out = {
    $comment: 'Written by app/scripts/fetch-documents.mjs; baked by app/wiki/documents.ts. Keys are Documents page titles.',
    documents: sorted,
  }
  writeFileSync(MANIFEST, `${JSON.stringify(out, null, 2)}\n`)
}

/* ------------------------------------------------------------- http -- */

let lastRequest = 0
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function politeFetch(url, init = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequest = Date.now()
    const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers }, redirect: 'follow' })
    if (res.status === 429 || res.status === 503) {
      const retryAfter = Number(res.headers.get('retry-after')) || 5 * 2 ** attempt
      console.warn(`  ${res.status} from ${new URL(url).host}; waiting ${retryAfter}s`)
      await sleep(retryAfter * 1000)
      continue
    }
    return res
  }
  throw new Error(`Gave up on ${url} after repeated 429/503`)
}

function isPdf(bytes) {
  return bytes.length > 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-'
}

async function download(url) {
  const res = await politeFetch(url)
  if (!res.ok) return null
  const bytes = Buffer.from(await res.arrayBuffer())
  return isPdf(bytes) ? bytes : null
}

/**
 * The newest Wayback capture of `url`, as a link to its original bytes. The
 * availability API misses some captures the CDX index has, so the index is
 * asked when it finds nothing.
 */
async function waybackCopy(url) {
  const res = await politeFetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`)
  const closest = res.ok ? (await res.json())?.archived_snapshots?.closest : null
  if (closest?.available && closest.status === '200') return `https://web.archive.org/web/${closest.timestamp}id_/${url}`
  const cdx = await politeFetch(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&filter=statuscode:200&fl=timestamp&limit=-1`)
  const timestamp = cdx.ok ? (await cdx.text()).trim().split('\n').pop() : ''
  return timestamp ? `https://web.archive.org/web/${timestamp}id_/${url}` : null
}

async function fetchPdf(doc) {
  const url = doc.fetchUrl || doc.source
  const direct = await download(url)
  if (direct) return { bytes: direct, from: url }
  console.log(`  ${new URL(url).host} refused or didn't return a PDF; trying the Wayback Machine`)
  const copy = await waybackCopy(url)
  if (!copy) return null
  const archived = await download(copy)
  return archived ? { bytes: archived, from: copy } : null
}

/* -------------------------------------------------------- rendering -- */

function pageCount(pdfPath) {
  // Poppler warns on stderr about plenty of harmless quirks in scanned PDFs.
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1])
  if (!pages) throw new Error('pdfinfo reported no pages')
  return pages
}

/** Characters of extractable text on each page, ignoring whitespace. */
function textByPage(pdfPath, pages) {
  const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 })
  // pdftotext ends every page with a form feed.
  return text.split('\f').slice(0, pages).map(page => page.replace(/\s+/g, '').length)
}

/** Below this much text a page is treated as a scan with no usable text layer. */
const MIN_TEXT_PER_PAGE = 200

/**
 * The number of pages that look like bare scans. Any at all means OCR: a
 * born-digital report with scanned appendices (GAO/NSIAD-95-187) has plenty of
 * text on average, but none on the pages a reader most needs to search.
 */
function scannedPages(pdfPath, pages) {
  return textByPage(pdfPath, pages).filter(chars => chars < MIN_TEXT_PER_PAGE).length
}

/**
 * Adds a text layer with ocrmypdf. `skip-text` OCRs only the pages with no
 * text; `force-ocr` discards whatever text the file has and OCRs every page
 * from its image. Returns the new file's path.
 */
function runOcr(pdfPath, mode) {
  const out = pdfPath.replace(/\.pdf$/, `.${mode}.pdf`)
  execFileSync('ocrmypdf', [
    '--quiet',
    `--${mode}`,
    '--output-type', 'pdf',
    '--optimize', '0',
    '--language', 'eng',
    pdfPath,
    out,
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  return out
}

/** One page as a WebP; returns its pixel size. */
function renderThumb(pdfPath, page, outPath) {
  const work = mkdtempSync(join(tmpdir(), 'uapgdb-doc-'))
  try {
    const png = join(work, 'page')
    execFileSync('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-png', '-scale-to-x', String(THUMB_WIDTH * 2), '-scale-to-y', '-1', pdfPath, png], { stdio: 'ignore' })
    execFileSync('cwebp', ['-quiet', '-q', '72', '-resize', String(THUMB_WIDTH), '0', `${png}.png`, '-o', outPath])
    const header = readFileSync(outPath)
    return webpSize(header)
  }
  finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** Width and height from a WebP's VP8/VP8L/VP8X header. */
function webpSize(buf) {
  const chunk = buf.subarray(12, 16).toString('latin1')
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21)
    return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 }
  }
  return { width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF }
}

/* --------------------------------------------------------- supabase -- */

async function initBucket() {
  const { url, key } = supabase()
  const headers = { 'Authorization': `Bearer ${key}`, 'apikey': key, 'Content-Type': 'application/json' }
  const existing = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, { headers })
  if (existing.ok) {
    console.log(`Bucket "${BUCKET}" already exists.`)
    return
  }
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_BYTES, allowed_mime_types: ['application/pdf'] }),
  })
  if (!res.ok) throw new Error(`Creating the bucket failed: HTTP ${res.status} ${await res.text()}`)
  console.log(`Created public bucket "${BUCKET}".`)
}

async function upload(bytes, name) {
  const { url, key } = supabase()
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Content-Type': 'application/pdf',
      'Cache-Control': 'max-age=31536000',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status} ${await res.text()}`)
  return `${url}/storage/v1/object/public/${BUCKET}/${name}`
}

/* ------------------------------------------------------------- main -- */

async function fetchOne(doc, manifest) {
  const slug = slugify(doc.title)
  const thumbFile = resolve(OUT_DIR, `${slug}.webp`)
  const prior = manifest.documents[doc.title]
  const sameOcr = (prior?.ocrRequest ?? 'auto') === doc.ocr
  if (!flags.has('--force') && prior && prior.source === doc.source && (prior.thumbPage ?? 1) === doc.thumbPage && sameOcr && existsSync(thumbFile)) {
    console.log(`= ${doc.title} (already archived)`)
    return
  }

  console.log(`> ${doc.title}`)
  // Redoing a file whose source hasn't changed (new OCR mode, new thumbnail
  // page) starts from the cached download instead of asking the site again.
  const cached = prior && prior.source === doc.source && resolve(CACHE, `${prior.sourceSha256 ?? prior.sha256}.pdf`)
  const got = cached && existsSync(cached)
    ? { bytes: readFileSync(cached), from: prior.fetchedFrom }
    : await fetchPdf(doc)
  if (!got) {
    console.warn(`  ! no PDF from ${doc.fetchUrl || doc.source} or the Wayback Machine; skipped`)
    return
  }
  const sourceSha256 = createHash('sha256').update(got.bytes).digest('hex')
  mkdirSync(CACHE, { recursive: true })
  const sourcePath = resolve(CACHE, `${sourceSha256}.pdf`)
  writeFileSync(sourcePath, got.bytes)
  const pages = pageCount(sourcePath)

  let ocr = null
  if (doc.ocr === 'redo') ocr = 'force-ocr'
  else if (doc.ocr === 'auto' && scannedPages(sourcePath, pages) > 0) ocr = 'skip-text'
  let pdfPath = sourcePath
  if (ocr) {
    console.log(`  running ocrmypdf (${ocr}) on ${pages} ${pages === 1 ? 'page' : 'pages'}…`)
    pdfPath = runOcr(sourcePath, ocr)
  }
  const bytes = readFileSync(pdfPath)
  if (bytes.length > MAX_BYTES) {
    console.warn(`  ! ${(bytes.length / 1e6).toFixed(1)} MB is over the bucket's limit; split it or raise the limit`)
    return
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (pdfPath !== resolve(CACHE, `${sha256}.pdf`)) writeFileSync(resolve(CACHE, `${sha256}.pdf`), bytes)

  mkdirSync(OUT_DIR, { recursive: true })
  const { width, height } = renderThumb(pdfPath, Math.min(doc.thumbPage, pages), thumbFile)

  const url = await upload(bytes, `${sha256}.pdf`)
  saveEntry(doc.title, {
    url,
    sha256,
    bytes: bytes.length,
    pages,
    ...(ocr ? { ocr, sourceSha256 } : {}),
    ...(doc.ocr === 'auto' ? {} : { ocrRequest: doc.ocr }),
    thumb: { src: `/documents/${slug}.webp`, width, height },
    thumbPage: Math.min(doc.thumbPage, pages),
    source: doc.source,
    fetchedFrom: got.from,
    retrieved: new Date().toISOString().slice(0, 10),
  })
  console.log(`  ✓ ${pages} ${pages === 1 ? 'page' : 'pages'}, ${(bytes.length / 1e3).toFixed(0)} KB, ${sha256.slice(0, 12)}…${ocr ? ` (OCR: ${ocr})` : ''}`)
}

/** The hosted copy of a document, from the cache or downloaded again from the bucket. */
async function hostedPdf(title) {
  const entry = readManifest().documents?.[title]
  if (!entry) throw new Error(`"${title}" isn't in wiki/documents.json; fetch it first`)
  const path = resolve(CACHE, `${entry.sha256}.pdf`)
  if (!existsSync(path)) {
    const res = await fetch(entry.url)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${entry.url}`)
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }
  return { path, entry }
}

/** `text "Title" [N-M]`: each page's text, headed `=== Page N ===`. */
async function printText() {
  const [title, range = ''] = names
  if (!title) throw new Error('Usage: text "Page title" [N-M]')
  const { path, entry } = await hostedPdf(title)
  const [from, to] = range ? range.split('-').map(Number) : [1, entry.pages]
  for (let n = from; n <= (to || from); n++) {
    const text = execFileSync('pdftotext', ['-f', String(n), '-l', String(n), path, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    console.log(`=== Page ${n} ===\n${text.replace(/\f/g, '').trimEnd()}\n`)
  }
}

/**
 * `draft "Title" [N-M]`: a first draft of a transcription, written by this
 * script from the hosted file's text layer, page by page, into
 * `scripts/.cache/documents/drafts/<Title> (Transcription).md` (or appended
 * to it, for a range). The transcriber then corrects it against the page
 * images with small edits and moves it into the vault when every page is
 * checked. Drafting here rather than retyping keeps long verbatim passages
 * out of the model's output, which the API's output filter can stop.
 */
async function draftTranscription() {
  const [title, range = ''] = names
  if (!title) throw new Error('Usage: draft "Page title" [N-M]')
  const { path, entry } = await hostedPdf(title)
  const [from, to] = range ? range.split('-').map(Number) : [1, entry.pages]
  const dir = resolve(CACHE, 'drafts')
  mkdirSync(dir, { recursive: true })
  const out = resolve(dir, `${title} (Transcription).md`)
  let body = existsSync(out) ? readFileSync(out, 'utf8').trimEnd() : [
    '---',
    `name: "${title} (Transcription)"`,
    `document: "${title}"`,
    `transcribed: "${new Date().toISOString().slice(0, 10)}"`,
    `method: "${entry.ocr ? `ocrmypdf (Tesseract, ${entry.ocr})` : 'the file\'s own text layer'}, checked page by page against the page images"`,
    'tags:',
    '  - transcription',
    '---',
    '',
    `A reading text of the [[${title}]]. Editorial marks are in square brackets; see "Transcriptions" in the site's documents guide for what each one means.`,
  ].join('\n')
  for (let n = from; n <= (to || from); n++) {
    const text = execFileSync('pdftotext', ['-f', String(n), '-l', String(n), path, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    body += `\n\n## Page ${n}\n\n${reflowPage(text) || '*[page blank]*'}`
  }
  writeFileSync(out, `${body}\n`)
  console.log(out)
}

/** `page "Title" N`: page N as a 1400px-wide PNG, for reading what OCR couldn't. */
async function renderPage() {
  const [title, n = '1'] = names
  if (!title) throw new Error('Usage: page "Page title" N')
  const { path } = await hostedPdf(title)
  const dir = resolve(CACHE, 'pages')
  mkdirSync(dir, { recursive: true })
  const out = resolve(dir, `${slugify(title)}-${n}`)
  execFileSync('pdftoppm', ['-f', n, '-l', n, '-singlefile', '-png', '-scale-to-x', '1400', '-scale-to-y', '-1', path, out], { stdio: 'ignore' })
  console.log(`${out}.png`)
}

/** `lookup <url>`: Wayback captures under a URL prefix, newest last. */
async function lookup() {
  const [url] = names
  if (!url) throw new Error('Usage: lookup <url or url prefix>')
  const query = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&matchType=prefix&filter=statuscode:200&collapse=urlkey&fl=timestamp,original,mimetype,length&limit=200`
  const res = await politeFetch(query)
  if (!res.ok) throw new Error(`HTTP ${res.status} from the Wayback Machine`)
  const rows = (await res.text()).trim().split('\n').filter(Boolean)
  if (!rows.length) console.log('No captures.')
  for (const row of rows) {
    const [timestamp, original, mime, length] = row.split(' ')
    console.log(`${mime.padEnd(16)} ${String(length).padStart(9)}  https://web.archive.org/web/${timestamp}id_/${original}`)
  }
}

/**
 * `probe <url>`: download a candidate (falling back to its newest Wayback
 * capture) into the cache and print its metadata and first two pages of text,
 * to check it is the document before its URL goes into `source_url`. A scan
 * with no text says so; render its pages with pdftoppm to read them.
 */
async function probe() {
  const [url] = names
  if (!url) throw new Error('Usage: probe <url>')
  const got = await fetchPdf({ source: url, fetchUrl: '' })
  if (!got) throw new Error('No PDF there, directly or in the Wayback Machine')
  const sha256 = createHash('sha256').update(got.bytes).digest('hex')
  const dir = resolve(CACHE, 'probe')
  mkdirSync(dir, { recursive: true })
  const path = resolve(dir, `${sha256}.pdf`)
  writeFileSync(path, got.bytes)
  const info = execFileSync('pdfinfo', [path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]) || 1
  const text = execFileSync('pdftotext', ['-l', '2', path, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  console.log(`From:   ${got.from}\nFile:   ${path}\nSize:   ${(got.bytes.length / 1e3).toFixed(0)} KB, sha256 ${sha256}`)
  console.log(info.split('\n').filter(l => /^(Title|Author|Creator|CreationDate|Pages):/.test(l)).join('\n'))
  console.log(`Text:   ${(n => (n === 0 ? 'yes' : n === pages ? 'little or none (a scan; it will be OCR\'d)' : `missing on ${n} of ${pages} pages (those will be OCR'd)`))(scannedPages(path, pages))}\n--- first two pages ---\n${text.trim().slice(0, 3000)}`)
}

async function main() {
  if (command === 'init') return initBucket()
  if (command === 'probe') return probe()
  if (command === 'draft') return draftTranscription()
  if (command === 'text') return printText()
  if (command === 'page') return renderPage()
  if (command === 'lookup') return lookup()

  const manifest = readManifest()
  manifest.documents ??= {}
  for (const title of targets()) {
    const doc = readDocument(title)
    if (!doc) {
      console.warn(`? ${title}: no such note in Documents/`)
      continue
    }
    if (!doc.source) {
      console.log(`- ${title}: no source_url (not public, or not yet sourced)`)
      continue
    }
    if (!HOSTABLE.has(doc.rights)) {
      console.log(`- ${title}: rights "${doc.rights || 'unset'}", linked, not hosted`)
      continue
    }
    if (command === 'check') {
      const entry = manifest.documents[title]
      console.log(`${entry ? '=' : '+'} ${title}: ${entry ? `archived ${entry.retrieved}` : 'to fetch'}`)
      continue
    }
    try {
      await fetchOne(doc, manifest)
    }
    catch (error) {
      console.error(`  ! ${title}: ${error.message}`)
    }
  }
}

await main()
