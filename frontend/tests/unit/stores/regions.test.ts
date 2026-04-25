import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRegionStore } from '@/stores/regions'
import type { RegionSummaryResponse } from '@/types/topology'

describe('useRegionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('replaces and clears region summaries', () => {
    const store = useRegionStore()
    const response: RegionSummaryResponse = {
      level: 'country',
      generation: 1,
      regions: [{
        id: 'country-0',
        level: 'country',
        name: 'Country 1',
        parentId: null,
        centroidLng: -135,
        centroidLat: 0,
        bbox: { west: -180, south: -90, east: -90, north: 90 },
        totalCount: 10,
        elementTypes: {
          firewall: 1,
          router: 2,
          switch: 3,
          server: 1,
          'access-point': 3,
        },
        internalLinkCount: 4,
      }],
      links: [{
        id: 'country-0--country-1',
        sourceRegionId: 'country-0',
        targetRegionId: 'country-1',
        count: 7,
      }],
    }

    store.replaceSummary(response)

    expect(store.level).toBe('country')
    expect(store.regionsList).toHaveLength(1)
    expect(store.linkCount).toBe(1)

    store.clear()

    expect(store.level).toBeNull()
    expect(store.regionsList).toEqual([])
    expect(store.linkCount).toBe(0)
  })
})
