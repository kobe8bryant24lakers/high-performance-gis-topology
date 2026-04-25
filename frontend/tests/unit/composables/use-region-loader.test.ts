import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { shouldUseRegionSummaries, useRegionLoader } from '@/composables/use-region-loader'
import { useViewportStore } from '@/stores/viewport'
import { useRegionStore } from '@/stores/regions'

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
    expect(shouldUseRegionSummaries(10)).toBe(false)
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

  it('clears region summaries at device zoom', async () => {
    const viewportStore = useViewportStore()
    const regionStore = useRegionStore()
    regionStore.replaceSummary({
      level: 'country',
      regions: [],
      links: [],
      generation: 1,
    })
    viewportStore.updateViewport({
      zoom: 10,
      center: { lng: 0, lat: 0 },
      bounds: { west: -180, south: -85, east: 180, north: 85 },
    })

    const { loadRegionSummaries, dispose } = useRegionLoader()
    await loadRegionSummaries()

    expect(regionStore.level).toBeNull()
    expect(fetchRegionSummary).not.toHaveBeenCalled()
    dispose()
  })
})
