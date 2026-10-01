import type { BakedVideo, GraphNode } from '../../shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { buildPersonProfile } from './personProfile'

function node(i: number, label: string, category: GraphNode['c']): GraphNode {
  return { i, l: label, p: `/wiki/${category.toLowerCase()}/${i}`, c: category, d: 0, x: 0, y: 0 }
}

// 0 is the person. 1–3 are videos, 4–7 are other entries.
const nodes: GraphNode[] = [
  node(0, 'Ada Person', 'People'),
  node(1, 'Video One', 'Videos'),
  node(2, 'Video Two', 'Videos'),
  node(3, 'Video Three', 'Videos'),
  node(4, 'Acme Corp', 'Organizations'),
  node(5, 'Bob Person', 'People'),
  node(6, 'Crash Event', 'Events'),
  node(7, 'Home', 'Root'),
]

const videos: BakedVideo[] = [
  { i: 1, id: 'aaa', at: null, dur: null, pub: '2025-05-01' },
  { i: 2, id: 'bbb', at: null, dur: null, pub: '2024-01-10' },
  { i: 3, id: 'ccc', at: null, dur: null, pub: null },
]

const outgoing: number[][] = [
  [4, 6], // the person links to Acme and the crash
  [0, 4, 5], // video one: person, Acme, Bob
  [0, 4], // video two: person, Acme
  [0], // video three: person only
  [],
  [0], // Bob links back to the person
  [],
  [0], // Home links to the person
]
const backlinks: number[][] = [[1, 2, 3, 5, 7], [], [], [], [0, 1, 2], [1], [0], []]

const profile = buildPersonProfile(0, {
  nodes,
  links: { outgoing, backlinks },
  previews: nodes.map(n => ({ title: n.l, lead: '', tags: [] })),
  videos,
  portraits: { 5: { src: '/people/bob.webp', width: 1, height: 1, author: 'A', license: 'CC0', source: 'x' } },
})

describe('buildPersonProfile', () => {
  it('lists the videos that link to the person, oldest published first, undated last', () => {
    expect(profile.videos.map(v => v.title)).toEqual(['Video Two', 'Video One', 'Video Three'])
    expect(profile.videos[0]).toMatchObject({ videoId: 'bbb', published: '2024-01-10' })
  })

  it('counts every video in the vault for the channel total', () => {
    expect(profile.channelVideos).toBe(3)
  })

  it('spans the channel from its first to its latest dated video', () => {
    expect(profile.channelSpan).toEqual(['2024-01-10', '2025-05-01'])
  })

  it('ranks connections by shared videos, then by links both ways', () => {
    expect(profile.connections.map(c => c.title)).toEqual(['Acme Corp', 'Bob Person', 'Crash Event'])
    expect(profile.connections[0]).toMatchObject({ shared: 2, linksTo: true, linkedFrom: false })
    expect(profile.connections[1]).toMatchObject({ shared: 1, linksTo: false, linkedFrom: true })
    expect(profile.connections[2]).toMatchObject({ shared: 0, linksTo: true, linkedFrom: false })
  })

  it('leaves videos and the home page out of the connections', () => {
    expect(profile.connections.some(c => c.category === 'Videos' || c.category === 'Root')).toBe(false)
  })

  it('carries a connected person\'s portrait', () => {
    expect(profile.connections.find(c => c.title === 'Bob Person')?.image?.src).toBe('/people/bob.webp')
  })

  it('handles a person nothing links to', () => {
    const lonely = buildPersonProfile(5, {
      nodes,
      links: { outgoing: nodes.map(() => []), backlinks: nodes.map(() => []) },
      previews: [],
      videos,
      portraits: {},
    })
    expect(lonely).toEqual({ videos: [], connections: [], channelVideos: 3, channelSpan: ['2024-01-10', '2025-05-01'] })
  })
})
