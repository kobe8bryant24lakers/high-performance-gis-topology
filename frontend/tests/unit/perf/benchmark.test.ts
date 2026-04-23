import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import { usePerformanceStore } from '@/stores/performance'
import { LruTileCache } from '@/utils/lru-tile-cache'
import type { NetworkElement, TopologyLink } from '@/types/topology'

function makeElements(count: number): NetworkElement[] {
  const elements: NetworkElement[] = []
  for (let i = 0; i < count; i++) {
    elements.push({
      id: `el-${i}`,
      type: 'router',
      label: `router-${i}`,
      lng: (i * 0.001) % 360 - 180,
      lat: (i * 0.001) % 180 - 90,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: { index: i },
    })
  }
  return elements
}

function makeLinks(elements: NetworkElement[], count: number): TopologyLink[] {
  const links: TopologyLink[] = []
  for (let i = 0; i < count; i++) {
    const srcIdx = i % elements.length
    const tgtIdx = (i + 1) % elements.length
    links.push({
      id: `link-${i}`,
      type: 'conn',
      sourceId: elements[srcIdx]!.id,
      targetId: elements[tgtIdx]!.id,
      directed: false,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: {},
    })
  }
  return links
}

describe('Performance Budgets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('merges 10K elements into topology store in < 500ms', () => {
    const store = useTopologyStore()
    const elements = makeElements(10_000)
    const start = performance.now()
    store.mergeTileElements('bench/0/0', {
      elements,
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    const elapsed = performance.now() - start
    expect(store.nodeCount).toBe(10_000)
    expect(elapsed).toBeLessThan(500)
  })

  it('evicts a tile with 5K elements in < 250ms', () => {
    const store = useTopologyStore()
    const elements = makeElements(5000)
    store.mergeTileElements('bench/0/0', {
      elements,
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    const start = performance.now()
    store.evictTile('bench/0/0')
    const elapsed = performance.now() - start
    expect(store.nodeCount).toBe(0)
    // Graphology node drops are sensitive to shared runner CPU throttling.
    // Keep this budget strict enough to catch regressions while avoiding CI flakiness.
    expect(elapsed).toBeLessThan(250)
  })

  it('LRU cache touch + eviction cycle handles 500 tiles in < 100ms', () => {
    const cache = new LruTileCache(200, 200_000)
    const start = performance.now()
    for (let i = 0; i < 500; i++) {
      cache.touch(`tile-${i}`, 100)
    }
    const elapsed = performance.now() - start
    expect(cache.size).toBeLessThanOrEqual(200)
    expect(elapsed).toBeLessThan(100)
  })

  it('degradation level changes correctly with element count', () => {
    const perfStore = usePerformanceStore()

    perfStore.visibleElementCount = 5000
    expect(perfStore.degradationLevel).toBe('full')
    expect(perfStore.hoverEnabled).toBe(true)
    expect(perfStore.pickEnabled).toBe(true)

    perfStore.visibleElementCount = 30000
    expect(perfStore.degradationLevel).toBe('reduced')
    expect(perfStore.hoverEnabled).toBe(false)
    expect(perfStore.pickEnabled).toBe(true)

    perfStore.visibleElementCount = 75000
    expect(perfStore.degradationLevel).toBe('minimal')
    expect(perfStore.pickEnabled).toBe(false)

    perfStore.visibleElementCount = 150000
    expect(perfStore.degradationLevel).toBe('minimal')
  })

  it('client-side filter matching on 10K elements completes in < 100ms', () => {
    const elements = makeElements(10_000)
    const start = performance.now()
    const filtered = elements.filter(
      (el) => el.type === 'router' && el.label.includes('500'),
    )
    const elapsed = performance.now() - start
    expect(filtered.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(100)
  })
})
