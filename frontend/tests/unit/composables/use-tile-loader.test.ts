import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  bboxToTiles,
  buildFilterQueryString,
  computeStaleTileKeys,
  computeTileRetryDelayMs,
  computeVisibleElementCount,
  isAbortError,
  shouldFetchTileLinks,
  shouldUseDeviceTiles,
  shouldFetchEndpoint,
} from '@/composables/use-tile-loader'
import {
  allowedNetworkTiersForZoom,
  allowedTypesForZoom,
} from '@/utils/visibility-policy'

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
      ['2/1/1', { elementsLoaded: true, linksLoaded: true, elementsInFlight: false, linksInFlight: false, elementCount: 120, elementRetryCount: 0, linkRetryCount: 0, nextElementRetryAt: 0, nextLinkRetryAt: 0 }],
      ['2/1/2', { elementsLoaded: true, linksLoaded: false, elementsInFlight: false, linksInFlight: false, elementCount: 80, elementRetryCount: 1, linkRetryCount: 2, nextElementRetryAt: 0, nextLinkRetryAt: 1000 }],
      ['2/2/1', { elementsLoaded: false, linksLoaded: true, elementsInFlight: false, linksInFlight: false, elementCount: 999, elementRetryCount: 3, linkRetryCount: 0, nextElementRetryAt: 3000, nextLinkRetryAt: 0 }],
      ['2/2/2', { elementsLoaded: true, linksLoaded: true, elementsInFlight: false, linksInFlight: false, elementCount: 60, elementRetryCount: 0, linkRetryCount: 0, nextElementRetryAt: 0, nextLinkRetryAt: 0 }],
    ])

    const visible = ['2/1/1', '2/1/2', '2/2/1']
    expect(computeVisibleElementCount(visible, tileStates)).toBe(200)
  })

  it('identifies loaded tiles outside the current viewport', () => {
    const loaded = ['2/1/1', '2/1/2', '3/4/4']
    const visible = new Set(['2/1/2'])

    expect(computeStaleTileKeys(loaded, visible)).toEqual(['2/1/1', '3/4/4'])
  })

  it('caps tile retry delay with exponential backoff', () => {
    expect(computeTileRetryDelayMs(1)).toBe(500)
    expect(computeTileRetryDelayMs(2)).toBe(1000)
    expect(computeTileRetryDelayMs(3)).toBe(2000)
    expect(computeTileRetryDelayMs(7)).toBe(30000)
  })
})

describe('shouldFetchEndpoint', () => {
  it('returns false when endpoint is already in flight', () => {
    expect(shouldFetchEndpoint(false, true, 0, Date.now())).toBe(false)
  })

  it('returns true when endpoint is not loaded, not in flight, and retry window is open', () => {
    const now = Date.now()
    expect(shouldFetchEndpoint(false, false, now - 1, now)).toBe(true)
  })
})

describe('shouldUseDeviceTiles', () => {
  it('loads device tiles from the California overview zoom', () => {
    expect(shouldUseDeviceTiles(4.9)).toBe(false)
    expect(shouldUseDeviceTiles(5)).toBe(true)
    expect(shouldUseDeviceTiles(15.3)).toBe(true)
  })
})

describe('shouldFetchTileLinks', () => {
  it('defers links until detailed device zooms', () => {
    expect(shouldFetchTileLinks(11.9)).toBe(false)
    expect(shouldFetchTileLinks(12)).toBe(true)
    expect(shouldFetchTileLinks(16)).toBe(true)
  })
})

describe('visibility policy', () => {
  it('keeps overview zoom focused on firewall hierarchy before other device types', () => {
    expect(allowedTypesForZoom(5)).toEqual(['firewall'])
    expect(allowedTypesForZoom(10)).toEqual(['firewall'])
    expect(allowedTypesForZoom(12)).toEqual(['firewall', 'router', 'switch'])
  })

  it('progressively reveals firewall network tiers', () => {
    expect(allowedNetworkTiersForZoom(5)).toEqual(['core'])
    expect(allowedNetworkTiersForZoom(8)).toEqual(['aggregation', 'core'])
    expect(allowedNetworkTiersForZoom(11)).toEqual([])
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
