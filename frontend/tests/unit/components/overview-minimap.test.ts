import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OverviewMinimap from '@/components/OverviewMinimap.vue'

const fetchRegionSummary = vi.fn()

vi.mock('@/api/region-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/region-service')>()
  return {
    ...actual,
    RegionService: class {
      nextGeneration = vi.fn(() => 1)
      currentGeneration = vi.fn(() => 1)
      fetchRegionSummary = fetchRegionSummary
      cancel = vi.fn()
    },
  }
})

function citySummary() {
  return {
    level: 'city' as const,
    generation: 1,
    links: [],
    regions: [
      {
        id: 'city-a',
        level: 'city' as const,
        name: 'City A',
        parentId: 'province-a',
        centroidLng: 0,
        centroidLat: 45,
        bbox: { west: -1, south: 44, east: 1, north: 46 },
        totalCount: 250,
        elementTypes: {
          firewall: 20,
          router: 40,
          switch: 70,
          server: 50,
          'access-point': 70,
        },
        internalLinkCount: 12,
      },
    ],
  }
}

describe('OverviewMinimap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchRegionSummary.mockReset()
    fetchRegionSummary.mockResolvedValue(citySummary())
  })

  it('renders global city heatmap, viewport bounds, and mouse position', async () => {
    const wrapper = mount(OverviewMinimap, {
      props: {
        bounds: { west: -10, south: 40, east: 10, north: 50 },
        mousePosition: { lng: 2, lat: 43 },
      },
    })
    await flushPromises()

    expect(fetchRegionSummary).toHaveBeenCalledWith(expect.objectContaining({
      z: 8,
      bounds: { west: -180, south: -85, east: 180, north: 85 },
    }), expect.any(Number))
    const heatmapCell = wrapper.find('[data-test="overview-heatmap-cell"]')
    expect(heatmapCell.exists()).toBe(true)
    expect(Number(heatmapCell.attributes('width'))).toBeGreaterThan(0)
    expect(Number(heatmapCell.attributes('height'))).toBeGreaterThan(0)
    expect(wrapper.find('[data-test="overview-density-point"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="overview-viewport"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="overview-mouse"]').exists()).toBe(true)
  })

  it('emits navigate coordinates from minimap clicks', async () => {
    const wrapper = mount(OverviewMinimap, {
      props: {
        bounds: null,
        mousePosition: null,
      },
    })
    await flushPromises()

    await wrapper.find('[data-test="overview-minimap-svg"]').trigger('click', {
      clientX: 120,
      clientY: 60,
    })

    const emitted = wrapper.emitted('navigate')?.[0]?.[0] as { lng: number; lat: number }
    expect(emitted.lng).toBeCloseTo(0)
    expect(emitted.lat).toBeCloseTo(0)
  })
})
