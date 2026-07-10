/**
 * `#wiki-data` — the vault, scanned at build time and inlined into the server
 * bundle by `nitro.virtual` in nuxt.config. See `wiki/bake.ts`.
 *
 * This declaration lives under `shared/` because Nitro's generated typed-routes
 * pull `server/api/*` into the *app* tsconfig project as well as the server one,
 * and `shared/**\/*.d.ts` is the only tree both of them include.
 *
 * The types are pulled in with inline `import(...)` rather than an `import`
 * statement: inside an ambient module declaration a relative specifier resolves
 * against the declared module *name* (`#wiki-data`), not against this file, so a
 * plain `import ... from './wiki'` silently degrades every export to `any`.
 */
declare module '#wiki-data' {
  export const tree: import('./wiki').TreeItem[]
  export const graph: import('./wiki').GraphPayload
  export const links: import('./wiki').BakedLinks
  export const previews: import('./wiki').BakedPreview[]
}
