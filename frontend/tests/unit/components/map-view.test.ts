import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import MapView from '@/components/MapView.vue'

const mapConstructor = vi.fn()

vi.mock('@deck.gl/mapbox', () => ({
  MapboxOverlay: class {
    setProps = vi.fn()
  },
}))

vi.mock('@/composables/use-deck-layers', () => ({
  useDeckLayers: () => ({ layers: { value: [] } }),
}))

vi.mock('@/composables/use-tile-loader', () => ({
  useTileLoader: () => ({ loadVisibleTiles: vi.fn() }),
}))

vi.mock('mapbox-gl', () => {
  class MockMap {
    constructor(options: unknown) {
      mapConstructor(options)
    }

    addControl = vi.fn()
    on = vi.fn()
    remove = vi.fn()
    getZoom = vi.fn(() => 2)
    getCenter = vi.fn(() => ({ lng: 0, lat: 0 }))
    getBounds = vi.fn(() => ({
      getWest: () => -180,
      getSouth: () => -85,
      getEast: () => 180,
      getNorth: () => 85,
    }))
  }

  return {
    default: {
      Map: MockMap,
      NavigationControl: vi.fn(),
      accessToken: '',
    },
  }
})

describe('MapView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'test-token')
    mapConstructor.mockClear()
  })

  it('initializes Mapbox as a flat 2D mercator map', () => {
    mount(MapView)

    expect(mapConstructor).toHaveBeenCalledWith(expect.objectContaining({
      projection: 'mercator',
      pitch: 0,
      bearing: 0,
    }))
  })
})
