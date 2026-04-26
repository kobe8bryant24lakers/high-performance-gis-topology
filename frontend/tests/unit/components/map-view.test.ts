import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import MapView from '@/components/MapView.vue'
import { usePerformanceStore } from '@/stores/performance'
import { useViewportStore } from '@/stores/viewport'

const mapConstructor = vi.fn()
const loadVisibleTiles = vi.fn()
const loadRegionSummaries = vi.fn()
const flyToMock = vi.fn()
const mapHandlers = new Map<string, (...args: any[]) => void>()

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
    flyTo = flyToMock
    on = vi.fn((event: string, handler: () => void) => {
      mapHandlers.set(event, handler)
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
    flyToMock.mockClear()
    mapHandlers.clear()
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

  it('shows guidance when a device-zoom viewport has no visible devices', async () => {
    const wrapper = mount(MapView)
    const viewportStore = useViewportStore()
    const performanceStore = usePerformanceStore()

    viewportStore.updateViewport({
      zoom: 12,
      center: { lng: 0, lat: 51 },
      bounds: { west: -1, south: 50, east: 1, north: 52 },
    })
    performanceStore.visibleElementCount = 0
    await nextTick()

    expect(wrapper.find('[data-test="empty-device-guide"]').exists()).toBe(true)
  })

  it('renders overview minimap and routes minimap navigation to the main map', async () => {
    const wrapper = mount(MapView, {
      global: {
        stubs: {
          OverviewMinimap: {
            props: ['bounds', 'mousePosition'],
            emits: ['navigate'],
            template: '<button data-test="overview-minimap-stub" @click="$emit(\'navigate\', { lng: 12, lat: 34 })" />',
          },
        },
      },
    })

    await wrapper.find('[data-test="overview-minimap-stub"]').trigger('click')

    expect(flyToMock).toHaveBeenCalledWith(expect.objectContaining({
      center: [12, 34],
      zoom: 2,
    }))
  })

  it('passes main map mouse coordinates to the overview minimap', async () => {
    const wrapper = mount(MapView, {
      global: {
        stubs: {
          OverviewMinimap: {
            props: ['bounds', 'mousePosition'],
            template: '<div data-test="overview-minimap-stub">{{ mousePosition?.lng }},{{ mousePosition?.lat }}</div>',
          },
        },
      },
    })

    mapHandlers.get('mousemove')?.({ lngLat: { lng: 12.5, lat: 34.5 } })
    await nextTick()

    expect(wrapper.find('[data-test="overview-minimap-stub"]').text()).toContain('12.5,34.5')
  })
})
