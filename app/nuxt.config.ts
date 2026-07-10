import tailwindcss from '@tailwindcss/vite'
import { replaceWikiLinks } from './wiki/vault'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // Tailwind v4 is wired up through its Vite plugin below, not the (v3-era) Nuxt module.
  modules: ['shadcn-nuxt', '@nuxt/content'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  shadcn: {
    prefix: '',
    componentDir: '@/components/ui'
  },
  hooks: {
    // Obsidian's [[wikilinks]] aren't markdown, so rewrite them to real links before parsing.
    'content:file:beforeParse'(ctx) {
      if (ctx.collection.name !== 'wiki') return
      ctx.file.body = replaceWikiLinks(String(ctx.file.body))
    },
  },
})