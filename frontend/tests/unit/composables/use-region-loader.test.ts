import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { shouldUseRegionSummaries, useRegionLoader } from '@/composables/use-region-loader'
import { useViewportStore } from '@/stores/viewport'
import { useRegionStore } from '@/stores/regions'
import { usePerformanceStore } from '@/stores/performance'

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

describe('shouldUseRegionSummaries', () => {
  it('uses region summaries through city zoom and stops at device zoom', () => {
    expect(shouldUseRegionSummaries(2)).toBe(true)
    expect(shouldUseRegionSummaries(9.9)).toBe(true)
    expect(shouldUseRegionSummaries(10, 4)).toBe(true)
    expect(shouldUseRegionSummaries(11.9, 4)).toBe(true)
    expect(shouldUseRegionSummaries(12, 0)).toBe(true)
    expect(shouldUseRegionSummaries(12, 4)).toBe(false)
  })
})

describe('useRegionLoader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchRegionSummary.mockReset()
  })

  it('loads region summaries for low zoom viewports', async () => {
    const viewportStore = useViewportStore()
    viewportStore.updateViewport({
      zoom: 2,
      center: { lng: 0, lat: 0 },
      bounds: { west: -180, south: -85, east: 180, north: 85 },
    })
    fetchRegionSummary.mockResolvedValueOnce({
      level: 'country',
      regions: [],
      links: [],
      generation: 1,
    })

    const { loadRegionSummaries, dispose } = useRegionLoader()
    await loadRegionSummaries()

    expect(fetchRegionSummary).toHaveBeenCalledOnce()
    dispose()
  })

  it('keeps region summaries at city zoom even when devices are visible', async () => {
    const viewportStore = useViewportStore()
    const regionStore = useRegionStore()
    const performanceStore = usePerformanceStore()
    regionStore.replaceSummary({
      level: 'country',
      regions: [],
      links: [],
      generation: 1,
    })
    performanceStore.visibleElementCount = 4
    viewportStore.updateViewport({
      zoom: 11,
      center: { lng: 0, lat: 0 },
      bounds: { west: -180, south: -85, east: 180, north: 85 },
    })
    fetchRegionSummary.mockResolvedValueOnce({
      level: 'city',
      regions: [],
      links: [],
      generation: 1,
    })

    const { loadRegionSummaries, dispose } = useRegionLoader()
    await loadRegionSummaries()

    expect(fetchRegionSummary).toHaveBeenCalledOnce()
    expect(regionStore.level).toBe('city')
    dispose()
  })

  it('clears region summaries at device zoom when devices are visible', async () => {
    const viewportStore = useViewportStore()
    const regionStore = useRegionStore()
    const performanceStore = usePerformanceStore()
    regionStore.replaceSummary({
      level: 'country',
      regions: [],
      links: [],
      generation: 1,
    })
    performanceStore.visibleElementCount = 4
    viewportStore.updateViewport({
      zoom: 12,
      center: { lng: 0, lat: 0 },
      bounds: { west: -180, south: -85, east: 180, north: 85 },
    })

    const { loadRegionSummaries, dispose } = useRegionLoader()
    await loadRegionSummaries()

    expect(regionStore.level).toBeNull()
    expect(fetchRegionSummary).not.toHaveBeenCalled()
    dispose()
  })

  it('loads city region guidance at device zoom when the visible device viewport is empty', async () => {
    const viewportStore = useViewportStore()
    const performanceStore = usePerformanceStore()
    performanceStore.visibleElementCount = 0
    viewportStore.updateViewport({
      zoom: 12,
      center: { lng: -122.4194, lat: 37.7749 },
      bounds: { west: -122.6, south: 37.6, east: -122.2, north: 38.0 },
    })
    fetchRegionSummary.mockResolvedValueOnce({
      level: 'city',
      regions: [],
      links: [],
      generation: 1,
    })

    const { loadRegionSummaries, dispose } = useRegionLoader()
    await loadRegionSummaries()

    expect(fetchRegionSummary).toHaveBeenCalledOnce()
    expect(fetchRegionSummary.mock.calls[0][0]).toMatchObject({ z: 9 })
    dispose()
  })
})
