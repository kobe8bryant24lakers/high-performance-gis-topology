import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
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
    expect(layerIds).toContain('node-icons')
    expect(layerIds).not.toContain('nodes')
    expect(layerIds).not.toContain('node-labels')
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
})
