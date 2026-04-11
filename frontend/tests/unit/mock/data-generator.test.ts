import { describe, it, expect, beforeEach } from 'vitest'
import { generateElements, generateLinks, elementsInTile, resetSeed } from '@/mock/data-generator'

describe('generateElements', () => {
  beforeEach(() => resetSeed())

  it('generates the requested number of elements', () => {
    const elements = generateElements(100)
    expect(elements).toHaveLength(100)
  })

  it('generates elements with valid coordinates', () => {
    const elements = generateElements(50)
    for (const el of elements) {
      expect(el.lng).toBeGreaterThanOrEqual(-180)
      expect(el.lng).toBeLessThanOrEqual(180)
      expect(el.lat).toBeGreaterThanOrEqual(-90)
      expect(el.lat).toBeLessThanOrEqual(90)
    }
  })

  it('generates elements with unique IDs', () => {
    const elements = generateElements(200)
    const ids = new Set(elements.map(e => e.id))
    expect(ids.size).toBe(200)
  })

  it('generates elements with required fields', () => {
    const elements = generateElements(1)
    const el = elements[0]
    expect(typeof el.id).toBe('string')
    expect(typeof el.type).toBe('string')
    expect(typeof el.label).toBe('string')
    expect(typeof el.version).toBe('number')
    expect(typeof el.updatedAt).toBe('string')
    expect(el.properties).toBeDefined()
  })
})

describe('generateLinks', () => {
  beforeEach(() => resetSeed())

  it('generates links between existing elements', () => {
    const elements = generateElements(20)
    const links = generateLinks(elements, 10)
    expect(links).toHaveLength(10)
    const elementIds = new Set(elements.map(e => e.id))
    for (const link of links) {
      expect(elementIds.has(link.sourceId)).toBe(true)
      expect(elementIds.has(link.targetId)).toBe(true)
    }
  })

  it('generates links with unique IDs', () => {
    const elements = generateElements(50)
    const links = generateLinks(elements, 30)
    const ids = new Set(links.map(l => l.id))
    expect(ids.size).toBe(30)
  })
})

describe('elementsInTile', () => {
  beforeEach(() => resetSeed())

  it('returns only elements within the tile bounding box', () => {
    const elements = generateElements(500)
    const inTile = elementsInTile(elements, 0, 0, 0)
    // z=0 tile covers the full lng range but only ±85.05° lat (Web Mercator)
    const expected = elements.filter(
      (el) => el.lng >= -180 && el.lng <= 180 && el.lat >= -85.05112877980659 && el.lat <= 85.05112877980659,
    )
    expect(inTile.length).toBe(expected.length)
  })

  it('returns a subset for a smaller tile', () => {
    const elements = generateElements(1000)
    const inTile = elementsInTile(elements, 2, 1, 1)
    expect(inTile.length).toBeLessThan(1000)
  })
})
