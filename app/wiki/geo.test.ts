import { describe, expect, it } from 'vitest'
import { parseCoordinates } from './geo'
import { splitFrontmatter } from './preview'

describe('parseCoordinates', () => {
  it('reads an inline YAML list string', () => {
    expect(parseCoordinates('[40.2786, -79.4078]')).toEqual([40.2786, -79.4078])
  })

  it('reads a bare comma pair', () => {
    expect(parseCoordinates('29.3709, -100.8959')).toEqual([29.3709, -100.8959])
  })

  it('reads an array of numbers or numeric strings', () => {
    expect(parseCoordinates([39.8, -84.05])).toEqual([39.8, -84.05])
    expect(parseCoordinates(['39.8', '"-84.05"'])).toEqual([39.8, -84.05])
  })

  it('rejects out-of-range values rather than clamping them', () => {
    expect(parseCoordinates([91, 0])).toBeNull()
    expect(parseCoordinates([0, -181])).toBeNull()
  })

  it('rejects the wrong arity and non-numbers', () => {
    expect(parseCoordinates([1])).toBeNull()
    expect(parseCoordinates([1, 2, 3])).toBeNull()
    expect(parseCoordinates('[north, west]')).toBeNull()
    expect(parseCoordinates('')).toBeNull()
    expect(parseCoordinates(undefined)).toBeNull()
    expect(parseCoordinates({ lat: 1, lon: 2 })).toBeNull()
  })
})

describe('splitFrontmatter coordinates', () => {
  it('reads an inline list', () => {
    const { frontmatter } = splitFrontmatter('---\ntitle: Crane\ncoordinates: [38.89, -86.83]\ntags: [location]\n---\nBody')
    expect(frontmatter.coordinates).toEqual([38.89, -86.83])
    expect(frontmatter.tags).toEqual(['location'])
  })

  it('reads a two-item block list', () => {
    const { frontmatter } = splitFrontmatter('---\ncoordinates:\n  - 38.89\n  - -86.83\ntags:\n  - location\n---\n')
    expect(frontmatter.coordinates).toEqual([38.89, -86.83])
    expect(frontmatter.tags).toEqual(['location'])
  })

  it('leaves a note without coordinates alone', () => {
    const { frontmatter } = splitFrontmatter('---\ntitle: x\n---\n')
    expect(frontmatter.coordinates).toBeUndefined()
  })
})
