import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import MapView from '@/components/MapView.vue'

const mapConstructor = vi.fn()
const loadVisibleTiles = vi.fn()
const loadRegionSummaries = vi.fn()

vi.mock('@deck.gl/mapbox', () => ({
  MapboxOverlay: class {
    setProps = vi.fn()
  },
}))

vi.mock('@/composables/use-deck-layers', () => ({
  useDeckLayers: () => ({ layers: { value: [] } }),
}))

vi.mock('@/composables/use-tile-loader', () => ({
  useTileLoader: () => ({ loadVisibleTiles }),
}))

vi.mock('@/composables/use-region-loader', () => ({
  useRegionLoader: () => ({ loadRegionSummaries, dispose: vi.fn() }),
}))

vi.mock('mapbox-gl', () => {
  class MockMap {
    constructor(options: unknown) {
      mapConstructor(options)
    }

    addControl = vi.fn()
    on = vi.fn((event: string, handler: () => void) => {
      if (event === 'load') handler()
    })
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
    loadVisibleTiles.mockClear()
    loadRegionSummaries.mockClear()
  })

  it('initializes Mapbox as a flat 2D mercator map', () => {
    mount(MapView)

    expect(mapConstructor).toHaveBeenCalledWith(expect.objectContaining({
      projection: 'mercator',
      pitch: 0,
      bearing: 0,
    }))
  })

  it('wires both region and device loaders on map load', () => {
    mount(MapView)

    expect(loadRegionSummaries).toHaveBeenCalledOnce()
    expect(loadVisibleTiles).toHaveBeenCalledOnce()
  })
})
