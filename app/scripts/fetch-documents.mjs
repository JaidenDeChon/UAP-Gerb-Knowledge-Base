// Archives the PDFs of vault Documents notes in the site's Supabase bucket,
// offline, and records each one in wiki/documents.json for the build to bake.
// Documented in docs/documents.md.
//
//   node scripts/fetch-documents.mjs init                create the public bucket
//   node scripts/fetch-documents.mjs fetch [targets]     download, render, upload
//   node scripts/fetch-documents.mjs check [targets]     report what's missing
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
// Needs poppler (pdfinfo, pdftoppm) and cwebp, and SUPABASE_URL plus
// SUPABASE_SERVICE_ROLE_KEY in the environment or in app/.env.local (never
// committed). The service-role key can write to storage; it stays on the
// machine that runs this script and is never sent to the site.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
if (!['init', 'fetch', 'check'].includes(command)) {
  console.error('Usage: node scripts/fetch-documents.mjs <init|fetch|check> ["Page title" ...] [--force]')
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

/** The newest Wayback capture of `url`, as a link to its original bytes. */
async function waybackCopy(url) {
  const res = await politeFetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`)
  if (!res.ok) return null
  const closest = (await res.json())?.archived_snapshots?.closest
  if (!closest?.available || closest.status !== '200') return null
  return `https://web.archive.org/web/${closest.timestamp}id_/${url}`
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
  if (!flags.has('--force') && prior && prior.source === doc.source && (prior.thumbPage ?? 1) === doc.thumbPage && existsSync(thumbFile)) {
    console.log(`= ${doc.title} (already archived)`)
    return
  }

  console.log(`> ${doc.title}`)
  const got = await fetchPdf(doc)
  if (!got) {
    console.warn(`  ! no PDF from ${doc.fetchUrl || doc.source} or the Wayback Machine; skipped`)
    return
  }
  if (got.bytes.length > MAX_BYTES) {
    console.warn(`  ! ${(got.bytes.length / 1e6).toFixed(1)} MB is over the bucket's limit; split it or raise the limit`)
    return
  }

  const sha256 = createHash('sha256').update(got.bytes).digest('hex')
  mkdirSync(CACHE, { recursive: true })
  const pdfPath = resolve(CACHE, `${sha256}.pdf`)
  writeFileSync(pdfPath, got.bytes)
  const pages = pageCount(pdfPath)

  mkdirSync(OUT_DIR, { recursive: true })
  const { width, height } = renderThumb(pdfPath, Math.min(doc.thumbPage, pages), thumbFile)

  const url = await upload(got.bytes, `${sha256}.pdf`)
  manifest.documents[doc.title] = {
    url,
    sha256,
    bytes: got.bytes.length,
    pages,
    thumb: { src: `/documents/${slug}.webp`, width, height },
    thumbPage: Math.min(doc.thumbPage, pages),
    source: doc.source,
    fetchedFrom: got.from,
    retrieved: new Date().toISOString().slice(0, 10),
  }
  writeManifest(manifest)
  console.log(`  ✓ ${pages} ${pages === 1 ? 'page' : 'pages'}, ${(got.bytes.length / 1e3).toFixed(0)} KB, ${sha256.slice(0, 12)}…`)
}

async function main() {
  if (command === 'init') return initBucket()

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
