import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import slugify from 'slugify'

/** The Obsidian vault, one level up from the Nuxt app. */
export const VAULT_DIR = fileURLToPath(new URL('../../UAP Gerb Knowledge Base', import.meta.url))

/** Route prefix the `wiki` collection is mounted under. */
export const WIKI_PREFIX = '/wiki'

/**
 * When a bare `[[Name]]` matches files in several folders, the earlier folder wins.
 * Anything unlisted sorts last.
 */
const FOLDER_PRIORITY = [
  'People',
  'Organizations',
  'Operations',
  'Events',
  'Locations',
  'Concepts',
  'MOCs',
  'Videos',
]

const IGNORED_DIRS = new Set(['_templates', 'node_modules'])

const SEMVER_REGEX = /^\d+(?:\.\d+)*(?:\.x)?$/

// Mirrors @nuxt/content's own path derivation so our hrefs match the routes it registers.
function refineUrlPart(name: string): string {
  name = name.split(/[/:]/).pop()!
  if (SEMVER_REGEX.test(name)) return name
  return name
    .replace(/(\d+\.)?(.*)/, '$2')
    .replace(/^index(\.draft)?$/, '')
    .replace(/\.draft$/, '')
}

function generatePath(stem: string): string {
  const path = stem
    .split('/')
    .map(part => slugify(refineUrlPart(part), { lower: true }))
    .join('/')
  return `${WIKI_PREFIX}/${path}`.replace(/\/+$/, '')
}

function walk(dir: string, base = ''): string[] {
  const stems: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) stems.push(...walk(`${dir}/${entry.name}`, rel))
    else if (entry.name.endsWith('.md')) stems.push(rel.slice(0, -3))
  }
  return stems
}

function folderRank(stem: string): number {
  const rank = FOLDER_PRIORITY.indexOf(stem.split('/')[0]!)
  return rank === -1 ? FOLDER_PRIORITY.length : rank
}

/** Lowercase and strip diacritics, so `Edgar Fouché` still finds `Edgar Fouche.md`. */
function fold(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export interface VaultIndex {
  /** Lowercased vault-relative stem (`videos/foo/summary`) → route path. */
  byStem: Map<string, string>
  /** Lowercased basename (`aj hartley`) → route path of the highest-priority match. */
  byName: Map<string, string>
  /** Same as `byName`, but diacritic-insensitive. Fallback only. */
  byFoldedName: Map<string, string>
}

let cached: VaultIndex | undefined

export function buildVaultIndex(force = false): VaultIndex {
  if (cached && !force) return cached

  const byStem = new Map<string, string>()
  const byName = new Map<string, string>()
  const byFoldedName = new Map<string, string>()
  const nameRank = new Map<string, number>()

  for (const stem of walk(VAULT_DIR)) {
    const path = generatePath(stem)
    byStem.set(stem.toLowerCase(), path)

    const basename = stem.split('/').pop()!
    const name = basename.toLowerCase()
    const rank = folderRank(stem)
    if (!byName.has(name) || rank < nameRank.get(name)!) {
      byName.set(name, path)
      byFoldedName.set(fold(basename), path)
      nameRank.set(name, rank)
    }
  }

  cached = { byStem, byName, byFoldedName }
  return cached
}

/**
 * Resolve an Obsidian wikilink target to a route, or `undefined` if the note doesn't exist.
 *
 * Handles the three shapes used in this vault:
 *   `[[AJ Hartley]]`                        — bare note name, resolved across folders
 *   `[[Videos/Some Title/summary|Alias]]`   — explicit vault-relative path
 *   `[[Video - Some Title]]` / `[[Some Title]]` — a video, meaning its summary note
 */
export function resolveWikiTarget(target: string, index = buildVaultIndex()): string | undefined {
  const clean = target.trim().replace(/\.md$/i, '')
  if (!clean) return undefined

  const key = clean.toLowerCase()
  if (clean.includes('/')) return index.byStem.get(key)

  const named = index.byName.get(key)
  if (named) return named

  const title = clean.replace(/^Video\s*-\s*/i, '').toLowerCase()
  const video = index.byStem.get(`videos/${title}/summary`)
  if (video) return video

  return index.byFoldedName.get(fold(clean))
}

const WIKILINK_RE = /(!?)\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g

/**
 * Rewrite `[[wikilinks]]` into markdown links before @nuxt/content parses the file.
 * Links to notes that don't exist are flattened to plain text rather than left dangling.
 */
export function replaceWikiLinks(body: string, index = buildVaultIndex()): string {
  return body.replace(WIKILINK_RE, (_full, _embed, target, anchor, alias) => {
    const label = (alias || target).trim()
    const path = resolveWikiTarget(target, index)
    if (!path) return label

    const hash = anchor ? `#${slugify(anchor.slice(1), { lower: true })}` : ''
    return `[${label}](<${path}${hash}>)`
  })
}
