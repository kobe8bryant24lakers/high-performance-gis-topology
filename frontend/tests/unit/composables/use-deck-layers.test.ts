import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import { useRegionStore } from '@/stores/regions'
import { useDeckLayers } from '@/composables/use-deck-layers'

describe('useDeckLayers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('builds an IconLayer for NE nodes and keeps the line layer', () => {
    const topologyStore = useTopologyStore()
    topologyStore.mergeTileElements('z0/x0/y0', {
      elements: [
        {
          id: 'el-1',
          type: 'router',
          label: 'router-1',
          lng: 0,
          lat: 0,
          version: 1,
          updatedAt: '2026-01-01T00:00:00Z',
          properties: {},
        },
      ],
      clusters: [],
      generation: 1,
      removedIds: [],
    })

    const { layers } = useDeckLayers(() => undefined, () => undefined)
    const layerIds = layers.value.map((layer) => layer.id)

    expect(layerIds).toContain('links')
    expect(layerIds).toContain('node-presence-halos')
    expect(layerIds).toContain('node-icons')
    expect(layerIds).not.toContain('nodes')
    expect(layerIds).not.toContain('node-labels')

    const iconLayer = layers.value.find((layer) => layer.id === 'node-icons')
    const icon = iconLayer?.props.getIcon(topologyStore.getElement('el-1'))
    expect(icon.url).toMatch(/^data:image\/svg\+xml,/)
    expect(icon.mask).toBe(false)
    expect(iconLayer?.props.getSize).toBe(30)

    const haloLayer = layers.value.find((layer) => layer.id === 'node-presence-halos')
    expect(haloLayer?.props.data).toHaveLength(1)
    expect(haloLayer?.props.getRadius).toBe(18)
    expect(haloLayer?.props.getFillColor(topologyStore.getElement('el-1'))).toEqual([77, 163, 255, 50])
  })

  it('keeps dense map layers complete after removing the alternate layout mode', () => {
    const topologyStore = useTopologyStore()

    topologyStore.mergeTileElements('z0/x0/y0', {
      elements: Array.from({ length: 5_100 }, (_, index) => ({
        id: `el-${index}`,
        type: 'router',
        label: `router-${index}`,
        lng: index % 180,
        lat: index % 80,
        version: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        properties: {},
      })),
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    topologyStore.mergeTileLinks('z0/x0/y0', {
      links: Array.from({ length: 5_099 }, (_, index) => ({
        id: `link-${index}`,
        type: 'connection',
        sourceId: `el-${index}`,
        targetId: `el-${index + 1}`,
        directed: false,
        version: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        properties: {},
      })),
      stubs: [],
      generation: 1,
      removedLinkIds: [],
    })

    const { layers } = useDeckLayers(() => undefined, () => undefined)
    const iconLayer = layers.value.find((layer) => layer.id === 'node-icons')
    const linkLayer = layers.value.find((layer) => layer.id === 'links')

    expect(iconLayer?.props.data).toHaveLength(5_100)
    expect(linkLayer?.props.data).toHaveLength(5_099)
    expect(linkLayer?.props.getWidth).toBe(1.5)
  })

  it('renders region summary layers instead of device layers when region summaries are active', () => {
    const regionStore = useRegionStore()
    regionStore.replaceSummary({
      level: 'country',
      generation: 1,
      regions: [
        {
          id: 'country-0',
          level: 'country',
          name: 'Country 1',
          parentId: null,
          centroidLng: -135,
          centroidLat: 0,
          bbox: { west: -180, south: -90, east: -90, north: 90 },
          totalCount: 1000,
          elementTypes: {
            firewall: 50,
            router: 100,
            switch: 300,
            server: 150,
            'access-point': 400,
          },
          internalLinkCount: 12,
        },
        {
          id: 'country-1',
          level: 'country',
          name: 'Country 2',
          parentId: null,
          centroidLng: -45,
          centroidLat: 0,
          bbox: { west: -90, south: -90, east: 0, north: 90 },
          totalCount: 500,
          elementTypes: {
            firewall: 25,
            router: 50,
            switch: 150,
            server: 75,
            'access-point': 200,
          },
          internalLinkCount: 8,
        },
      ],
      links: [{
        id: 'country-0--country-1',
        sourceRegionId: 'country-0',
        targetRegionId: 'country-1',
        count: 42,
      }],
    })

    const { layers } = useDeckLayers(() => undefined, () => undefined)
    const layerIds = layers.value.map((layer) => layer.id)

    expect(layerIds).toContain('region-virtual-links')
    expect(layerIds).toContain('region-boundaries')
    expect(layerIds).toContain('region-summary-labels')
    expect(layerIds).not.toContain('node-icons')

    const linkLayer = layers.value.find((layer) => layer.id === 'region-virtual-links')
    expect(linkLayer?.props.data).toHaveLength(1)
  })
})
