import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  bboxToTiles,
  buildFilterQueryString,
  computeTileRetryDelayMs,
  computeVisibleElementCount,
  isAbortError,
} from '@/composables/use-tile-loader'

describe('bboxToTiles', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns tiles covering a bounding box', () => {
    const tiles = bboxToTiles(
      { west: -10, south: -10, east: 10, north: 10 },
      3,
    )
    expect(tiles.length).toBeGreaterThan(0)
    for (const t of tiles) {
      expect(t.z).toBe(3)
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns a single tile at zoom 0', () => {
    const tiles = bboxToTiles(
      { west: -180, south: -85, east: 180, north: 85 },
      0,
    )
    expect(tiles).toEqual([{ z: 0, x: 0, y: 0 }])
  })

  it('covers tiles across antimeridian-crossing bounds', () => {
    const tiles = bboxToTiles(
      { west: 170, south: -10, east: -170, north: 10 },
      2,
    )
    const xSet = new Set(tiles.map((t) => t.x))
    expect(xSet.has(0)).toBe(true)
    expect(xSet.has(3)).toBe(true)
  })

  it('clamps +180 longitude to valid tile index', () => {
    const tiles = bboxToTiles(
      { west: 179.9, south: -1, east: 180, north: 1 },
      3,
    )
    expect(tiles.length).toBeGreaterThan(0)
    expect(Math.max(...tiles.map((t) => t.x))).toBe(7)
  })

  it('computes visible element count from visible tile keys only', () => {
    const tileStates = new Map([
      ['2/1/1', { elementsLoaded: true, linksLoaded: true, elementCount: 120, elementRetryCount: 0, linkRetryCount: 0, nextElementRetryAt: 0, nextLinkRetryAt: 0 }],
      ['2/1/2', { elementsLoaded: true, linksLoaded: false, elementCount: 80, elementRetryCount: 1, linkRetryCount: 2, nextElementRetryAt: 0, nextLinkRetryAt: 1000 }],
      ['2/2/1', { elementsLoaded: false, linksLoaded: true, elementCount: 999, elementRetryCount: 3, linkRetryCount: 0, nextElementRetryAt: 3000, nextLinkRetryAt: 0 }],
      ['2/2/2', { elementsLoaded: true, linksLoaded: true, elementCount: 60, elementRetryCount: 0, linkRetryCount: 0, nextElementRetryAt: 0, nextLinkRetryAt: 0 }],
    ])

    const visible = ['2/1/1', '2/1/2', '2/2/1']
    expect(computeVisibleElementCount(visible, tileStates)).toBe(200)
  })

  it('caps tile retry delay with exponential backoff', () => {
    expect(computeTileRetryDelayMs(1)).toBe(500)
    expect(computeTileRetryDelayMs(2)).toBe(1000)
    expect(computeTileRetryDelayMs(3)).toBe(2000)
    expect(computeTileRetryDelayMs(7)).toBe(30000)
  })
})

describe('buildFilterQueryString', () => {
  it('encodes type tokens and property filters safely', () => {
    const query = buildFilterQueryString(
      ['Router', 'access point'],
      { 'site.code': 'nyc 01' },
    )
    expect(query).toBe('?types=router,access%20point&prop.site.code=nyc%2001')
  })
})

describe('isAbortError', () => {
  it('detects DOMException AbortError', () => {
    const err = new DOMException('Aborted', 'AbortError')
    expect(isAbortError(err)).toBe(true)
  })

  it('detects non-DOMException with name AbortError', () => {
    const err = { name: 'AbortError', message: 'request aborted' }
    expect(isAbortError(err)).toBe(true)
  })

  it('rejects regular errors', () => {
    expect(isAbortError(new Error('timeout'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })

  it('rejects DOMException with non-abort name', () => {
    const err = new DOMException('Not found', 'NotFoundError')
    expect(isAbortError(err)).toBe(false)
  })
})
