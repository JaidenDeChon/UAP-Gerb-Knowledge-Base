import { defineCollection, defineContentConfig, z } from '@nuxt/content'
import { VAULT_DIR } from './wiki/vault'

export default defineContentConfig({
  collections: {
    wiki: defineCollection({
      type: 'page',
      source: {
        cwd: VAULT_DIR,
        include: '**/*.md',
        exclude: ['_templates/**'],
        prefix: '/wiki',
      },
      // Frontmatter across the vault is inconsistent, so everything beyond the
      // fields @nuxt/content requires is optional.
      schema: z.object({
        name: z.string().optional(),
        role: z.string().optional(),
        tags: z.array(z.string()).default([]),
        url: z.string().optional(),
        video_id: z.string().optional(),
        channel: z.string().optional(),
      }),
    }),
  },
})
