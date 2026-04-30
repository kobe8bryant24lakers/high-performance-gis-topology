import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OverviewMinimap from '@/components/OverviewMinimap.vue'

const fetchDeviceHeatmap = vi.fn()

vi.mock('@/api/heatmap-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/heatmap-service')>()
  return {
    ...actual,
    HeatmapService: class {
      nextGeneration = vi.fn(() => 1)
      currentGeneration = vi.fn(() => 1)
      fetchDeviceHeatmap = fetchDeviceHeatmap
      cancel = vi.fn()
    },
  }
})

function deviceHeatmap() {
  return {
    west: -180,
    south: -85,
    east: 180,
    north: 85,
    columns: 48,
    rows: 24,
    maxCount: 20,
    totalCount: 30,
    generation: 1,
    cells: [
      { x: 24, y: 6, count: 20 },
      { x: 25, y: 7, count: 10 },
    ],
  }
}

describe('OverviewMinimap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchDeviceHeatmap.mockReset()
    fetchDeviceHeatmap.mockResolvedValue(deviceHeatmap())
  })

  it('renders nearby real-device heatmap, viewport bounds, and mouse position', async () => {
    const wrapper = mount(OverviewMinimap, {
      props: {
        bounds: { west: -10, south: 40, east: 10, north: 50 },
        zoom: 8.4,
        mousePosition: { lng: 2, lat: 43 },
      },
    })
    await flushPromises()

    expect(fetchDeviceHeatmap).toHaveBeenCalledWith(expect.objectContaining({
      bounds: { west: -20, south: 35, east: 20, north: 55 },
      columns: 48,
      rows: 24,
      zoom: 8.4,
    }), expect.any(Number))
    const heatmapCells = wrapper.findAll('[data-test="overview-heatmap-cell"]')
    expect(heatmapCells.length).toBeGreaterThan(2)
    expect(Number(heatmapCells[0].attributes('width'))).toBeGreaterThan(0)
    expect(Number(heatmapCells[0].attributes('height'))).toBeGreaterThan(0)
    expect(wrapper.find('[data-test="overview-density-point"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="overview-viewport"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="overview-mouse"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nearby density')
    expect(wrapper.text()).toContain('30 devices')
    expect(wrapper.text()).toContain('Visible policy heatmap; cursor is location only')
  })

  it('emits navigate coordinates from minimap clicks', async () => {
    const wrapper = mount(OverviewMinimap, {
      props: {
        bounds: null,
        zoom: 5,
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
