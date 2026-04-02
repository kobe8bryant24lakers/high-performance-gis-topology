import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import type { NetworkElement, TopologyLink } from '@/types/topology'

function makeElement(id: string, lng = 0, lat = 0): NetworkElement {
  return { id, type: 'router', label: `R-${id}`, lng, lat, version: 1, updatedAt: '', properties: {} }
}

function makeLink(id: string, sourceId: string, targetId: string): TopologyLink {
  return { id, type: 'conn', sourceId, targetId, directed: false, version: 1, updatedAt: '', properties: {} }
}

describe('useTopologyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('merges tile elements into the graph', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a'), makeElement('b')],
      clusters: [], generation: 1, removedIds: [],
    })
    expect(store.graph.order).toBe(2)
    expect(store.graph.hasNode('a')).toBe(true)
    expect(store.graph.hasNode('b')).toBe(true)
  })

  it('upserts elements with higher version', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a')],
      clusters: [], generation: 1, removedIds: [],
    })
    expect(store.graph.getNodeAttribute('a', 'label')).toBe('R-a')

    const updatedEl = { ...makeElement('a'), label: 'Updated', version: 2 }
    store.mergeTileElements('2/1/1', {
      elements: [updatedEl],
      clusters: [], generation: 2, removedIds: [],
    })
    expect(store.graph.getNodeAttribute('a', 'label')).toBe('Updated')
  })

  it('removes elements listed in removedIds', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a'), makeElement('b')],
      clusters: [], generation: 1, removedIds: [],
    })
    store.mergeTileElements('2/1/1', {
      elements: [], clusters: [], generation: 2, removedIds: ['a'],
    })
    expect(store.graph.hasNode('a')).toBe(false)
    expect(store.graph.hasNode('b')).toBe(true)
  })

  it('does NOT remove elements merely absent from a tile response', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a'), makeElement('b')],
      clusters: [], generation: 1, removedIds: [],
    })
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('b')],
      clusters: [], generation: 2, removedIds: [],
    })
    expect(store.graph.hasNode('a')).toBe(true)
  })

  it('merges tile links with tile reference counting', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a'), makeElement('b')],
      clusters: [], generation: 1, removedIds: [],
    })
    store.mergeTileLinks('2/1/1', {
      links: [makeLink('l1', 'a', 'b')],
      stubs: [], generation: 1, removedLinkIds: [],
    })
    expect(store.graph.size).toBe(1)
    expect(store.graph.hasEdge('l1')).toBe(true)
  })

  it('evicts tile data while preserving graph integrity', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a')],
      clusters: [], generation: 1, removedIds: [],
    })
    store.mergeTileElements('2/1/2', {
      elements: [makeElement('b')],
      clusters: [], generation: 1, removedIds: [],
    })
    store.evictTile('2/1/1')
    expect(store.graph.hasNode('a')).toBe(false)
    expect(store.graph.hasNode('b')).toBe(true)
  })

  it('does not evict elements present in multiple tiles', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a')],
      clusters: [], generation: 1, removedIds: [],
    })
    store.mergeTileElements('2/1/2', {
      elements: [makeElement('a')],
      clusters: [], generation: 1, removedIds: [],
    })
    store.evictTile('2/1/1')
    expect(store.graph.hasNode('a')).toBe(true)
  })
})
