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
})
