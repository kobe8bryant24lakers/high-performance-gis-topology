import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useViewportStore } from '@/stores/viewport'

describe('useViewportStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has default viewport state', () => {
    const store = useViewportStore()
    expect(store.zoom).toBe(2)
    expect(store.center).toEqual({ lng: 0, lat: 0 })
    expect(store.bounds).toBeNull()
  })

  it('updates bounds and zoom', () => {
    const store = useViewportStore()
    store.updateViewport({
      zoom: 10,
      center: { lng: 116.4, lat: 39.9 },
      bounds: { west: 116.0, south: 39.5, east: 117.0, north: 40.5 },
    })
    expect(store.zoom).toBe(10)
    expect(store.center.lng).toBe(116.4)
    expect(store.bounds).not.toBeNull()
  })

  it('computes visible tile coordinates', () => {
    const store = useViewportStore()
    store.updateViewport({
      zoom: 2,
      center: { lng: 0, lat: 0 },
      bounds: { west: -45, south: -45, east: 45, north: 45 },
    })
    const tiles = store.visibleTiles
    expect(tiles.length).toBeGreaterThan(0)
    for (const tile of tiles) {
      expect(tile).toHaveProperty('z')
      expect(tile).toHaveProperty('x')
      expect(tile).toHaveProperty('y')
    }
  })
})
