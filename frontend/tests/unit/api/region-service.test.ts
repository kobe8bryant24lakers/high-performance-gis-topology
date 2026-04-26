import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRegionSummaryQuery, RegionService } from '@/api/region-service'
import type { RegionSummaryResponse } from '@/types/topology'

describe('RegionService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('builds a region summary query with bbox, type filters, and property filters', () => {
    const query = buildRegionSummaryQuery({
      z: 2,
      bounds: { west: -180, south: -85, east: 180, north: 85 },
      types: ['router'],
      propertyFilters: { vendor: 'acme' },
    })

    expect(query).toBe('?z=2&west=-180&south=-85&east=180&north=85&types=router&prop.vendor=acme')
  })

  it('fetches region summaries from the backend endpoint', async () => {
    const response: RegionSummaryResponse = {
      level: 'country',
      regions: [],
      links: [],
      generation: 1,
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    )

    const service = new RegionService()
    const result = await service.fetchRegionSummary({
      z: 2,
      bounds: { west: -180, south: -85, east: 180, north: 85 },
      types: [],
      propertyFilters: {},
    })

    expect(result).toEqual(response)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85',
      expect.any(Object),
    )
  })
})
