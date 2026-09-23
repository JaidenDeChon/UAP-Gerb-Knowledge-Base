// Fetches portrait thumbnails for vault People from Wikipedia / Wikimedia
// Commons, offline, so the site never sends a visitor's browser to Wikimedia.
// Documented in docs/wiki-components.md ("People portraits").
//
//   node scripts/fetch-people-images.mjs discover [targets]   propose matches
//   node scripts/fetch-people-images.mjs fetch [targets]      download images
//
// Targets (both commands): `--roster` (default) is every People page named in
// a `::wiki-roster` block of any video summary; `--all` is every People page;
// or list page titles as arguments ("David Grusch" "Ben Rich").
//
// Matching is never guessed at fetch time. A person is fetched only when their
// page carries an explicit `wikipedia: "Article title"` frontmatter field,
// added by hand after checking the article is about the same person.
// `discover` helps with that: for each target without the field it looks the
// page title up on English Wikipedia (following redirects) and prints the
// article's short description, whether it's a disambiguation page, and whether
// Wikidata says it's a human, beside the vault's own `role:` line. It changes
// nothing; you add `wikipedia:` for the matches you've verified.
//
// `fetch` then, for each target with `wikipedia:`:
//   1. asks the Wikipedia API for the article's lead image, free-licence only
//      (`pageimages`, `pilicense=free`), skipping disambiguation pages. An
//      optional `wikipedia_image: "File:…"` on the page names a Commons file
//      to use instead, for an article whose lead image isn't a portrait;
//   2. asks for that file's metadata (`imageinfo` + `extmetadata`) and keeps it
//      only if it is hosted on Wikimedia Commons (non-free "fair use" files
//      live on Wikipedia itself, never on Commons), is not flagged non-free,
//      carries a recognised free licence (CC0, CC BY, CC BY-SA, public
//      domain), and names an author wherever the licence requires attribution;
//   3. downloads a 330px Commons thumbnail and re-encodes it to a 240px-wide
//      WebP (`cwebp`, falling back to a JPEG via macOS `sips`) under
//      `public/people/<slug>.webp`, typically 3–17 KB;
//   4. records the result in `wiki/people-images.json`, the manifest the build
//      bakes into `/api/resolve` (see wiki/portraits.ts): file, size, author,
//      licence, and the Commons file page to credit.
// People that can't be illustrated go in the manifest's `skipped` map with the
// reason, so a re-run doesn't ask again (pass `--retry` to re-check them).
//
// Politeness: one request at a time, at least 1.1s apart, `maxlag=5` on API
// calls, a descriptive User-Agent (Wikimedia's policy), and backoff honouring
// `Retry-After` on 429/503. API responses are cached in
// `scripts/.cache/people-images/` (gitignored), and a person already in the
// manifest with their file on disk is skipped without any request, so re-runs
// are cheap. `--force` re-processes everyone targeted (from the API cache,
// re-downloading the images); `--refresh` also bypasses the API cache.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rosterNames, slugify, vetLicense } from './people-images-lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP = resolve(__dirname, '..')
const VAULT = resolve(APP, '../UAP Gerb Knowledge Base')
const PEOPLE_DIR = resolve(VAULT, 'People')
const OUT_DIR = resolve(APP, 'public/people')
const MANIFEST = resolve(APP, 'wiki/people-images.json')
const CACHE = resolve(__dirname, '.cache/people-images')

const USER_AGENT = 'UAPGerbKnowledgeBase-PortraitFetcher/1.0 (https://github.com/JaidenDeChon/UAP-Gerb-Knowledge-Base; offline build script, run by hand)'
const MIN_INTERVAL_MS = 1100
const THUMB_REQUEST_WIDTH = 330 // a standard Wikimedia thumbnail step
const OUTPUT_WIDTH = 240

/* ------------------------------------------------------------- args -- */

const [command = 'fetch', ...rest] = process.argv.slice(2)
const flags = new Set(rest.filter(a => a.startsWith('--')))
const names = rest.filter(a => !a.startsWith('--'))
if (!['discover', 'fetch'].includes(command)) {
  console.error('Usage: node scripts/fetch-people-images.mjs <discover|fetch> [--roster|--all|"Page title" ...] [--retry] [--force] [--refresh]')
  process.exit(1)
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

function readPerson(title) {
  const file = resolve(PEOPLE_DIR, `${title}.md`)
  if (!existsSync(file)) return null
  const fm = frontmatter(readFileSync(file, 'utf8'))
  const image = (fm.wikipedia_image ?? '').replace(/^File:/i, '')
  return { title, role: fm.role ?? '', wikipedia: fm.wikipedia ?? '', image }
}

/** People named in any `::wiki-roster` block across the video summaries. */
function rosterPeople() {
  const found = new Set()
  const videos = resolve(VAULT, 'Videos')
  for (const dir of readdirSync(videos)) {
    const file = resolve(videos, dir, 'summary.md')
    if (!existsSync(file)) continue
    for (const name of rosterNames(readFileSync(file, 'utf8'))) {
      if (existsSync(resolve(PEOPLE_DIR, `${name}.md`))) found.add(name)
    }
  }
  return [...found].sort()
}

function targets() {
  if (names.length) return names
  if (flags.has('--all')) {
    return readdirSync(PEOPLE_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
  }
  return rosterPeople()
}

/* ------------------------------------------------------------- http -- */

let lastRequest = 0
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function politeFetch(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequest = Date.now()
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } })
    if (res.status === 429 || res.status === 503) {
      const retryAfter = Number(res.headers.get('retry-after')) || 5 * 2 ** attempt
      console.warn(`  ${res.status} from ${new URL(url).host}; waiting ${retryAfter}s`)
      await sleep(retryAfter * 1000)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return res
  }
  throw new Error(`Gave up after repeated 429/503 for ${url}`)
}

/** A MediaWiki API GET, JSON, cached on disk by URL. */
async function api(host, params) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params })}`
  mkdirSync(CACHE, { recursive: true })
  const file = resolve(CACHE, `${createHash('sha1').update(url).digest('hex')}.json`)
  if (existsSync(file) && !flags.has('--refresh')) return JSON.parse(readFileSync(file, 'utf8'))
  for (let attempt = 0; attempt < 4; attempt++) {
    const json = await (await politeFetch(url)).json()
    if (json.error?.code === 'maxlag') {
      await sleep(5000 * (attempt + 1))
      continue
    }
    if (json.error) throw new Error(`API error ${json.error.code}: ${json.error.info}`)
    writeFileSync(file, JSON.stringify(json))
    return json
  }
  throw new Error('API kept reporting maxlag')
}

/* ------------------------------------------------------------ image -- */

function hasCommand(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
}

/** Downloads `url` and writes a resized WebP (or JPEG) to public/people. */
async function saveThumbnail(url, slug, sourceWidth, sourceHeight, mime) {
  const bytes = Buffer.from(await (await politeFetch(url)).arrayBuffer())
  mkdirSync(CACHE, { recursive: true })
  let tmp = resolve(CACHE, `${slug}.download`)
  writeFileSync(tmp, bytes)
  // cwebp reads JPEG/PNG/TIFF/WebP but not GIF; convert a GIF (a few old
  // portraits) to PNG first.
  if (mime === 'image/gif') {
    const png = resolve(CACHE, `${slug}.png`)
    execFileSync('sips', ['-s', 'format', 'png', tmp, '--out', png], { stdio: 'ignore' })
    rmSync(tmp)
    tmp = png
  }
  mkdirSync(OUT_DIR, { recursive: true })
  const width = Math.min(OUTPUT_WIDTH, sourceWidth)
  const height = Math.round(sourceHeight * width / sourceWidth)
  let out
  if (hasCommand('cwebp')) {
    out = resolve(OUT_DIR, `${slug}.webp`)
    execFileSync('cwebp', ['-quiet', '-q', '72', '-m', '6', '-metadata', 'none', '-resize', String(width), String(height), tmp, '-o', out])
  }
  else if (hasCommand('sips')) {
    out = resolve(OUT_DIR, `${slug}.jpg`)
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-z', String(height), String(width), tmp, '--out', out], { stdio: 'ignore' })
  }
  else {
    throw new Error('Needs `cwebp` (brew install webp) or macOS `sips` to resize images')
  }
  rmSync(tmp)
  return { file: `/people/${out.split('/').pop()}`, width, height, bytes: statSync(out).size }
}

/* --------------------------------------------------------- manifest -- */

function loadManifest() {
  if (!existsSync(MANIFEST)) return { people: {}, skipped: {} }
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  return { people: m.people ?? {}, skipped: m.skipped ?? {} }
}

function saveManifest(m) {
  const sort = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(MANIFEST, `${JSON.stringify({
    $comment: 'Written by app/scripts/fetch-people-images.mjs; baked into /api/resolve by app/wiki/portraits.ts. Keys are People page titles.',
    people: sort(m.people),
    skipped: sort(m.skipped),
  }, null, 2)}\n`)
}

/* --------------------------------------------------------- commands -- */

async function discover() {
  const people = targets().map(readPerson).filter(Boolean).filter(p => !p.wikipedia)
  console.log(`Looking up ${people.length} people without a wikipedia: field…\n`)
  const rows = []
  for (let i = 0; i < people.length; i += 50) {
    const batch = people.slice(i, i + 50)
    const json = await api('en.wikipedia.org', {
      action: 'query',
      titles: batch.map(p => p.title).join('|'),
      redirects: '1',
      prop: 'pageprops|description|pageimages',
      ppprop: 'disambiguation|wikibase_item',
      piprop: 'name',
      pilicense: 'free',
    })
    const redirect = new Map((json.query.redirects ?? []).map(r => [r.from, r.to]))
    const normalized = new Map((json.query.normalized ?? []).map(r => [r.from, r.to]))
    const pages = new Map(json.query.pages.map(p => [p.title, p]))
    for (const person of batch) {
      let t = normalized.get(person.title) ?? person.title
      t = redirect.get(t) ?? t
      const page = pages.get(t)
      rows.push({ person, page: page && !page.missing ? page : null })
    }
  }
  // Wikidata: is the article about a human (P31 = Q5)?
  const ids = rows.map(r => r.page?.pageprops?.wikibase_item).filter(Boolean)
  const human = new Set()
  for (let i = 0; i < ids.length; i += 50) {
    const json = await api('www.wikidata.org', { action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'claims' })
    for (const [id, entity] of Object.entries(json.entities ?? {})) {
      if ((entity.claims?.P31 ?? []).some(c => c.mainsnak?.datavalue?.value?.id === 'Q5')) human.add(id)
    }
  }
  for (const { person, page } of rows) {
    if (!page) {
      console.log(`--  ${person.title}: no article`)
      continue
    }
    const flagsOut = [
      page.pageprops?.disambiguation !== undefined ? 'DISAMBIGUATION' : '',
      human.has(page.pageprops?.wikibase_item) ? 'human' : 'NOT-HUMAN',
      page.pageimage ? 'free-image' : 'no-free-image',
    ].filter(Boolean).join(', ')
    console.log(`??  ${person.title} -> "${page.title}" [${flagsOut}]\n      wiki:  ${page.description ?? '(no description)'}\n      vault: ${person.role}`)
  }
  console.log('\nNothing was written. Add `wikipedia: "<article title>"` to each verified person page, then run `fetch`.')
}

async function fetchAll() {
  const manifest = loadManifest()
  const list = targets()
  const tally = { fetched: 0, kept: 0, skipped: 0, noField: 0 }
  for (const title of list) {
    const person = readPerson(title)
    if (!person) {
      console.log(`!!  ${title}: no People page`)
      continue
    }
    if (!person.wikipedia) {
      tally.noField++
      continue
    }
    // Keyed on what the page asks for, so editing `wikipedia:` or
    // `wikipedia_image:` re-fetches that person on the next run.
    const request = person.image ? `${person.wikipedia} | File:${person.image}` : person.wikipedia
    const force = flags.has('--force') || flags.has('--refresh')
    const have = manifest.people[title]
    if (have && have.request === request && existsSync(resolve(APP, 'public', `.${have.file}`)) && !force) {
      tally.kept++
      continue
    }
    const skippedBefore = manifest.skipped[title]
    if (skippedBefore && skippedBefore.request === request && !flags.has('--retry') && !force) {
      tally.skipped++
      continue
    }

    const skip = (reason) => {
      delete manifest.people[title]
      manifest.skipped[title] = { request, reason }
      tally.skipped++
      console.log(`--  ${title}: ${reason}`)
    }

    try {
      const page = (await api('en.wikipedia.org', {
        action: 'query',
        titles: person.wikipedia,
        redirects: '1',
        prop: 'pageimages|pageprops',
        ppprop: 'disambiguation',
        piprop: 'name',
        pilicense: 'free',
      })).query.pages[0]
      if (!page || page.missing) { skip(`no Wikipedia article "${person.wikipedia}"`); continue }
      if (page.pageprops?.disambiguation !== undefined) { skip('Wikipedia title is a disambiguation page'); continue }
      const fileName = person.image || page.pageimage
      if (!fileName) { skip('article has no freely licensed lead image'); continue }

      const info = (await api('en.wikipedia.org', {
        action: 'query',
        titles: `File:${fileName}`,
        prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata',
        iiurlwidth: String(THUMB_REQUEST_WIDTH),
        iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|NonFree|AttributionRequired',
      })).query.pages[0]
      const ii = info?.imageinfo?.[0]
      if (!ii) { skip('no image metadata'); continue }
      if (info.imagerepository !== 'shared') { skip('image is not on Wikimedia Commons (likely non-free)'); continue }
      if (!/^image\/(?:jpeg|png|webp|gif)$/.test(ii.mime)) { skip(`unsupported image type ${ii.mime}`); continue }
      const credit = vetLicense(ii.extmetadata)
      if (credit.skip) { skip(credit.skip); continue }

      const saved = await saveThumbnail(ii.thumburl ?? ii.url, slugify(title), ii.thumbwidth ?? ii.width, ii.thumbheight ?? ii.height, ii.mime)
      manifest.people[title] = {
        request,
        file: saved.file,
        width: saved.width,
        height: saved.height,
        source: ii.descriptionurl,
        license: credit.license,
        licenseUrl: credit.licenseUrl,
        author: credit.author,
      }
      delete manifest.skipped[title]
      tally.fetched++
      console.log(`ok  ${title}: ${saved.file} (${Math.round(saved.bytes / 1024)} KB, ${credit.license}, ${credit.author})`)
    }
    catch (error) {
      console.error(`!!  ${title}: ${error.message}`)
    }
    saveManifest(manifest)
  }
  saveManifest(manifest)
  console.log(`\n${list.length} targeted: ${tally.fetched} fetched, ${tally.kept} already had an image, ${tally.skipped} skipped (see manifest), ${tally.noField} without a wikipedia: field.`)
}

await (command === 'discover' ? discover() : fetchAll())
