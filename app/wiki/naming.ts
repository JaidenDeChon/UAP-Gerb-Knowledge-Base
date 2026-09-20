/**
 * Pure vault-naming helpers with no `node:*` imports and no side effects.
 *
 * `vault.ts` runs filesystem scans at module scope (`resolveVaultDir()`), which
 * is fine for config-time and route-handler code that legitimately touches the
 * vault, but `server/utils/wiki.ts` only needs the label-ranking rules from
 * `resolve.ts` — importing `vault.ts` for that dragged `node:fs`/`node:path`/
 * `node:url` (and the cold-start `existsSync` probe) into the Nitro server
 * bundle, defeating the "vault never touches the filesystem at runtime"
 * invariant documented in nuxt.config.ts. Keeping these two exports in a leaf
 * module lets `resolve.ts` depend on them without pulling `vault.ts` in.
 */

/**
 * When a bare `[[Name]]` matches files in several folders, the earlier folder wins.
 * Anything unlisted sorts last.
 */
export const FOLDER_PRIORITY = [
  'People',
  'Organizations',
  'Operations',
  'Events',
  'Locations',
  'Concepts',
  'MOCs',
  'Videos',
]

/** Lowercase and strip diacritics, so `Edgar Fouché` still finds `Edgar Fouche.md`. */
export function fold(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
