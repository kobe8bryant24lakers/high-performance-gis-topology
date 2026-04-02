import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { bboxToTiles } from '@/composables/use-tile-loader'

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
})
