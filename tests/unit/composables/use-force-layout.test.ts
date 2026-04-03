// tests/unit/composables/use-force-layout.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import { extractLayoutInput } from '@/composables/use-force-layout'

describe('extractLayoutInput', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('extracts nodes and edges from topology graph', () => {
    const store = useTopologyStore()
    store.mergeTileElements('t1', {
      elements: [
        { id: 'a', type: 'router', label: 'A', lng: 10, lat: 20, version: 1, updatedAt: '', properties: {} },
        { id: 'b', type: 'switch', label: 'B', lng: 30, lat: 40, version: 1, updatedAt: '', properties: {} },
      ],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    store.mergeTileLinks('t1', {
      links: [{ id: 'e1', type: 'conn', sourceId: 'a', targetId: 'b', directed: false, version: 1, updatedAt: '', properties: {} }],
      stubs: [],
      generation: 1,
      removedLinkIds: [],
    })

    const input = extractLayoutInput(store)
    expect(input.nodes).toHaveLength(2)
    expect(input.edges).toHaveLength(1)
    expect(input.nodes.find((n) => n.id === 'a')).toBeDefined()
    expect(input.edges[0]!.source).toBe('a')
    expect(input.edges[0]!.target).toBe('b')
  })

  it('excludes stub nodes', () => {
    const store = useTopologyStore()
    store.mergeTileElements('t1', {
      elements: [
        { id: 'a', type: 'router', label: 'A', lng: 10, lat: 20, version: 1, updatedAt: '', properties: {} },
      ],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    store.mergeTileLinks('t1', {
      links: [{ id: 'e1', type: 'conn', sourceId: 'a', targetId: 'b', directed: false, version: 1, updatedAt: '', properties: {} }],
      stubs: [{ id: 'b', lng: 50, lat: 60 }],
      generation: 1,
      removedLinkIds: [],
    })

    const input = extractLayoutInput(store)
    expect(input.nodes).toHaveLength(1)
    expect(input.nodes[0]!.id).toBe('a')
  })

  it('returns empty for empty graph', () => {
    const store = useTopologyStore()
    const input = extractLayoutInput(store)
    expect(input.nodes).toEqual([])
    expect(input.edges).toEqual([])
  })
})
