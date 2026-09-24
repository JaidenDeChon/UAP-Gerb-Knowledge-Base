import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// Relative rather than the `#shared` alias — see the note in ./graph.ts.
import type { NotePortrait } from '../shared/types/wiki'

/**
 * People portraits.
 *
 * `scripts/fetch-people-images.mjs` downloads freely licensed portraits from
 * Wikimedia Commons into `public/people/` and records each one, with its
 * credit, in `wiki/people-images.json`, keyed by People page title. The bake
 * reads that manifest (here) and `/api/resolve`, `/api/preview` and
 * `/api/meta` hand the portrait to components on the note's ref. Nothing
 * about a portrait is requested from Wikimedia at build or request time.
 */

/** The manifest beside this module (resolved like `VAULT_DIR`, see ./vault.ts). */
function manifestPath(): string {
  const candidates = [
    resolve(process.cwd(), 'wiki/people-images.json'),
    fileURLToPath(new URL('./people-images.json', import.meta.url)),
  ]
  return candidates.find(existsSync) ?? candidates[0]!
}

const SRC_RE = /^\/people\/[a-z0-9-]+\.(?:webp|jpe?g|png)$/
const HTTP_RE = /^https:\/\/\S+$/

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

/**
 * Validates the manifest's `people` map into `{ "People/<title>": portrait }`.
 * An entry missing any credit field, with a `file` outside `/people/`, or with
 * a non-https source is dropped: a portrait is only ever shown with its
 * attribution. Pure, so it's unit-tested directly.
 */
export function parsePortraitManifest(raw: unknown): Record<string, NotePortrait> {
  const out: Record<string, NotePortrait> = {}
  const people = (raw as { people?: unknown } | null)?.people
  if (!people || typeof people !== 'object') return out
  for (const [title, entry] of Object.entries(people as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const src = str(e.file)
    const width = positive(e.width)
    const height = positive(e.height)
    const author = str(e.author)
    const license = str(e.license)
    const source = str(e.source)
    const licenseUrl = str(e.licenseUrl)
    if (!title.trim() || !SRC_RE.test(src) || !width || !height || !author || !license || !HTTP_RE.test(source)) continue
    out[`People/${title.trim()}`] = {
      src,
      width,
      height,
      author,
      license,
      source,
      ...(HTTP_RE.test(licenseUrl) ? { licenseUrl } : {}),
    }
  }
  return out
}

/** Portraits keyed by vault stem (`People/David Grusch`). */
export function loadPortraits(): Record<string, NotePortrait> {
  try {
    return parsePortraitManifest(JSON.parse(readFileSync(manifestPath(), 'utf8')))
  }
  catch {
    return {}
  }
}
