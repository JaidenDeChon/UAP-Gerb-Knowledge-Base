import type { GraphNode } from '../../shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { buildTopEntries, TOP_CATEGORIES } from './topEntries'

function node(i: number, label: string, category: GraphNode['c']): GraphNode {
  return { i, l: label, p: `/wiki/${category.toLowerCase()}/${i}`, c: category, d: 0, x: 0, y: 0 }
}

const nodes: GraphNode[] = [
  node(0, 'Ada', 'People'),
  node(1, 'Bob', 'People'),
  node(2, 'Cy', 'People'),
  node(3, 'Acme', 'Organizations'),
  node(4, 'Video', 'Videos'),
  node(5, 'Map', 'MOCs'),
  node(6, 'Lonely', 'Concepts'),
]
const backlinks: number[][] = [
  [3, 4], // Ada: 2 links, 1 video
  [3, 4, 5], // Bob: 3 links, 1 video
  [3, 5], // Cy: 2 links, 0 videos
  [0, 4], // Acme
  [0, 1],
  [4],
  [6], // only itself
]

const top = buildTopEntries(2, {
  nodes,
  links: { outgoing: nodes.map(() => []), backlinks },
  previews: nodes.map(n => ({ title: n.l, lead: `About ${n.l}`, tags: [] })),
  portraits: { 1: { src: '/people/bob.webp', width: 1, height: 1, author: 'A', license: 'CC0', source: 'x' } },
})

describe('buildTopEntries', () => {
  it('ranks by links, then videos, and keeps the top N per kind', () => {
    expect(top.find(g => g.category === 'People')!.entries.map(e => e.title)).toEqual(['Bob', 'Ada'])
  })

  it('counts links and videos, and carries the lead and portrait', () => {
    const bob = top[0]!.entries[0]!
    expect(bob).toMatchObject({ links: 3, videos: 1, lead: 'About Bob', category: 'People' })
    expect(bob.image?.src).toBe('/people/bob.webp')
  })

  it('leaves out videos, maps of content, self-links and empty kinds, in category order', () => {
    expect(top.map(g => g.category)).toEqual(['People', 'Organizations'])
    expect(TOP_CATEGORIES).not.toContain('Videos')
    expect(TOP_CATEGORIES).not.toContain('MOCs')
  })
})
