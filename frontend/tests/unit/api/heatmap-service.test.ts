import { describe, expect, it } from 'vitest'
import { buildDeviceHeatmapQuery } from '@/api/heatmap-service'

describe('buildDeviceHeatmapQuery', () => {
  it('includes viewport bounds, grid size, zoom, types, and property filters', () => {
    const query = buildDeviceHeatmapQuery({
      bounds: { west: -124, south: 33, east: -118, north: 39 },
      columns: 32,
      rows: 16,
      zoom: 8.7,
      types: ['Firewall'],
      propertyFilters: { 'site.code': 'ca core' },
    })

    expect(query).toBe(
      '?west=-124&south=33&east=-118&north=39&cols=32&rows=16&z=8&types=firewall&prop.site.code=ca%20core',
    )
  })
})
