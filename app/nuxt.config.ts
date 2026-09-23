import tailwindcss from '@tailwindcss/vite'
import { bakeWikiDataModule } from './wiki/bake'
import { cleanTocLabels } from './wiki/toc'
import { replaceObsidianCallouts, replaceWikiLinks } from './wiki/vault'

const PAGE_CACHE = { isr: true, headers: { 'Netlify-Vary': 'cookie=uapgdb-theme' } }

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // Tailwind v4 is wired up through its Vite plugin below, not the (v3-era) Nuxt module.
  modules: ['shadcn-nuxt', '@nuxt/content'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
    },
  },
  // Cache every page's HTML at Netlify's CDN until the next deploy (a deploy
  // purges it), so a repeat visit never waits on a cold function. Pages only:
  // the /api routes take query strings, and those are left uncached rather
  // than trusting the cache key to include them. The theme is rendered from
  // its cookie (useThemeHead), so the cache varies on that cookie, or one
  // visitor's theme would be served to everyone. `isr` only has an effect on
  // the Netlify and Vercel presets; local dev and preview don't cache.
  routeRules: {
    '/': PAGE_CACHE,
    '/videos': PAGE_CACHE,
    '/wiki/**': PAGE_CACHE,
  },
  content: {
    renderer: { anchorLinks: false },
  },
  nitro: {
    virtual: {
      // The vault lives beside the app in the repo, so it exists while this
      // builds — but it is not traced into the deployed server bundle. Scan it
      // now and inline the result; the routes never touch the filesystem.
      // Consequence: editing a note requires a dev-server restart to see it in
      // the sidebar tree, the graph, or a hover preview (the page body itself
      // still hot-reloads through @nuxt/content).
      '#wiki-data': () => bakeWikiDataModule(),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  shadcn: {
    prefix: '',
    componentDir: '@/components/ui'
  },
  hooks: {
    // Obsidian's [[wikilinks]] and `> [!type]` callouts aren't markdown, so
    // rewrite both into things @nuxt/content understands before parsing.
    'content:file:beforeParse'(ctx) {
      if (ctx.collection.name !== 'wiki') return
      ctx.file.body = replaceObsidianCallouts(replaceWikiLinks(String(ctx.file.body)))
    },
    // A heading carrying an MDC component gets that component's body text
    // flattened into its TOC entry — see ./wiki/toc.ts.
    'content:file:afterParse'(ctx) {
      if (ctx.collection.name !== 'wiki') return
      cleanTocLabels(ctx.content?.body)
    },
  },
})