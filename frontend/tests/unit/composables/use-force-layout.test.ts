// tests/unit/composables/use-force-layout.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import {
  computeSchematicViewState,
  extractLayoutInput,
  projectNodeToSchematicPosition,
  projectNodesToSchematicPositions,
} from '@/composables/use-force-layout'

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

  it('projects large node sets into distinct schematic positions without collapsing to origin', () => {
    const positions = projectNodesToSchematicPositions([
      { id: 'west', x: -120, y: 40 },
      { id: 'east', x: 120, y: -35 },
      { id: 'center', x: 0, y: 0 },
    ])

    expect(positions).toHaveLength(3)
    expect(positions.find((p) => p.id === 'west')).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    )
    expect(positions.find((p) => p.id === 'east')?.x).toBeGreaterThan(positions.find((p) => p.id === 'west')!.x)
    expect(positions.find((p) => p.id === 'west')).not.toEqual({ id: 'west', x: 0, y: 0 })
    expect(new Set(positions.map((p) => `${p.x}:${p.y}`)).size).toBe(3)
  })

  it('projects a single node to a stable non-origin schematic fallback position', () => {
    const projected = projectNodeToSchematicPosition(-90, 45)
    expect(projected.x).toBe(-450)
    expect(projected.y).toBeCloseTo(-264.54675, 4)
  })

  it('computes a centered schematic view state that fits projected positions', () => {
    const viewState = computeSchematicViewState(
      [
        { id: 'a', x: -900, y: -500 },
        { id: 'b', x: 900, y: 500 },
      ],
      1200,
      800,
    )

    expect(viewState.target).toEqual([0, 0, 0])
    expect(viewState.zoom).toBeLessThan(0)
  })
})
