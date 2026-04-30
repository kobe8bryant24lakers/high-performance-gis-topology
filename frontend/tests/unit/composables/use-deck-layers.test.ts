import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import { useRegionStore } from '@/stores/regions'
import { useViewportStore } from '@/stores/viewport'
import { usePerformanceStore } from '@/stores/performance'
import { useDeckLayers } from '@/composables/use-deck-layers'

function cityRegionSummary() {
  return {
    level: 'city' as const,
    generation: 1,
    regions: [
      {
        id: 'city-0',
        level: 'city' as const,
        name: 'City 1',
        parentId: 'province-0',
        centroidLng: 0,
        centroidLat: 51,
        bbox: { west: -1, south: 50, east: 1, north: 52 },
        totalCount: 100,
        elementTypes: {
          firewall: 10,
          router: 20,
          switch: 30,
          server: 20,
          'access-point': 20,
        },
        internalLinkCount: 4,
      },
    ],
    links: [],
  }
}

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

  it('adds a top-right tier badge for firewall nodes only', () => {
    const topologyStore = useTopologyStore()
    topologyStore.mergeTileElements('z5/x5/y12', {
      elements: [
        {
          id: 'fw-core',
          type: 'firewall',
          label: 'firewall-core',
          lng: -119,
          lat: 37,
          version: 1,
          updatedAt: '2026-01-01T00:00:00Z',
          properties: { networkTier: 'core' },
        },
        {
          id: 'router-1',
          type: 'router',
          label: 'router-1',
          lng: -118,
          lat: 36,
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
    const badgeLayer = layers.value.find((layer) => layer.id === 'firewall-tier-badges')

    expect(badgeLayer?.props.data).toHaveLength(1)
    expect(badgeLayer?.props.data[0].id).toBe('fw-core')
    expect(badgeLayer?.props.getText(topologyStore.getElement('fw-core'))).toBe('core')
    expect(badgeLayer?.props.getPixelOffset).toEqual([14, -14])
    expect(badgeLayer?.props.getTextAnchor).toBe('middle')
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

  it('ignores region summaries and renders device layers only', () => {
    const topologyStore = useTopologyStore()
    const regionStore = useRegionStore()
    regionStore.replaceSummary(cityRegionSummary())
    topologyStore.mergeTileElements('z5/x4/y12', {
      elements: [{
        id: 'fw-1',
        type: 'firewall',
        label: 'firewall-1',
        lng: -119,
        lat: 37,
        version: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        properties: {},
      }],
      clusters: [],
      generation: 1,
      removedIds: [],
    })

    const { layers } = useDeckLayers(() => undefined, () => undefined)
    const layerIds = layers.value.map((layer) => layer.id)

    expect(layerIds).toContain('node-icons')
    expect(layerIds).not.toContain('region-virtual-links')
    expect(layerIds).not.toContain('region-boundaries')
    expect(layerIds).not.toContain('region-summary-labels')
  })

  it('does not render region summaries as high-zoom guidance when the device viewport is empty', () => {
    const viewportStore = useViewportStore()
    const regionStore = useRegionStore()
    const performanceStore = usePerformanceStore()
    viewportStore.updateViewport({
      zoom: 12,
      center: { lng: 0, lat: 51 },
      bounds: { west: -1, south: 50, east: 1, north: 52 },
    })
    performanceStore.visibleElementCount = 0
    regionStore.replaceSummary(cityRegionSummary())

    const { layers } = useDeckLayers(() => undefined, () => undefined)
    const layerIds = layers.value.map((layer) => layer.id)

    expect(layerIds).toContain('links')
    expect(layerIds).toContain('node-icons')
    expect(layerIds).not.toContain('region-summary-labels')
  })

  it('prefers device layers at high zoom once visible devices are loaded', () => {
    const viewportStore = useViewportStore()
    const topologyStore = useTopologyStore()
    const regionStore = useRegionStore()
    const performanceStore = usePerformanceStore()
    viewportStore.updateViewport({
      zoom: 12,
      center: { lng: 0, lat: 51 },
      bounds: { west: -1, south: 50, east: 1, north: 52 },
    })
    performanceStore.visibleElementCount = 1
    regionStore.replaceSummary(cityRegionSummary())
    topologyStore.mergeTileElements('z12/x1/y1', {
      elements: [{
        id: 'el-1',
        type: 'router',
        label: 'router-1',
        lng: 0,
        lat: 51,
        version: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        properties: {},
      }],
      clusters: [],
      generation: 1,
      removedIds: [],
    })

    const { layers } = useDeckLayers(() => undefined, () => undefined)
    const layerIds = layers.value.map((layer) => layer.id)

    expect(layerIds).toContain('node-icons')
    expect(layerIds).not.toContain('region-summary-labels')
  })
})
