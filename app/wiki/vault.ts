import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import slugify from 'slugify'
// Type-only — erased at runtime, so this stays importable from a plain Node/Vite
// (config-load) context. Relative rather than the `#shared` alias because the
// node/config tsconfig project has no `#shared` path mapping.
import type { Category } from '../shared/types/wiki'

/**
 * The Obsidian vault, one level up from the Nuxt rootDir.
 *
 * Config-time (jiti) gets a real `import.meta.url`, but the Nitro runtime bundle
 * does not, so `new URL('../../…', import.meta.url)` collapses to a bad relative
 * path there. Resolve against the rootDir (cwd) first and fall back to the
 * module-relative path, picking whichever actually exists on disk.
 */
function resolveVaultDir(): string {
  const candidates = [
    resolve(process.cwd(), '../UAP Gerb Knowledge Base'),
    fileURLToPath(new URL('../../UAP Gerb Knowledge Base', import.meta.url)),
  ]
  return candidates.find(existsSync) ?? candidates[0]!
}

export const VAULT_DIR = resolveVaultDir()

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

/** Matches an Obsidian wikilink. **Global — stateful.** Clone it or reset
 * `lastIndex` before reusing it for a fresh scan. Groups: 1 embed `!`,
 * 2 target, 3 `#anchor`, 4 `|alias`. */
export const WIKILINK_RE = /(!?)\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g

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

/* ------------------------------------------------- additive vault helpers -- */

/** The set of top-level folders that are real categories (everything else -> Root). */
const TOP_FOLDERS = new Set(FOLDER_PRIORITY)

/** Every note in the vault as a vault-relative stem, e.g. `People/AJ Hartley`,
 * `Videos/Some Title/summary`, `Home`. Excludes `_templates/` and dotfiles. */
export function walkVault(): string[] {
  return walk(VAULT_DIR)
}

/** The route path a stem maps to — identical to the hrefs @nuxt/content registers. */
export function stemToPath(stem: string): string {
  return generatePath(stem)
}

/** Top-level vault folder a stem belongs to; `Root` for the vault's Home note. */
export function categoryOf(stem: string): Category {
  const top = stem.split('/')[0]!
  return TOP_FOLDERS.has(top) ? (top as Category) : 'Root'
}
