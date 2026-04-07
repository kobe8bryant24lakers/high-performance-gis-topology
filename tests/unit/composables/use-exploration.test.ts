import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { handlers } from '@/mock/handlers'
import { TileService } from '@/api/tile-service'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('TileService.fetchNeighbors', () => {
  it('fetches neighbors for a valid element', async () => {
    const service = new TileService()
    const result = await service.fetchNeighbors('el-0')
    expect(result).toBeDefined()
    expect(result!.elements).toBeInstanceOf(Array)
    expect(result!.links).toBeInstanceOf(Array)
  })

  it('returns null for non-existent element', async () => {
    const service = new TileService()
    await expect(service.fetchNeighbors('nonexistent-id')).rejects.toThrow()
  })

  it('respects depth parameter', async () => {
    const service = new TileService()
    const depth1 = await service.fetchNeighbors('el-0', 1)
    const depth2 = await service.fetchNeighbors('el-0', 2)
    expect(depth2!.elements.length).toBeGreaterThanOrEqual(depth1!.elements.length)
  })
})

describe('useExploration (store integration)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('expandNeighbors merges elements into topology graph', async () => {
    const { expandNeighbors } = await import('@/composables/use-exploration')
    const { useTopologyStore } = await import('@/stores/topology')
    const { useExplorationStore } = await import('@/stores/exploration')

    const topologyStore = useTopologyStore()
    const explorationStore = useExplorationStore()

    // Seed the source node so it exists in the graph
    topologyStore.graph.addNode('el-0', {
      id: 'el-0', type: 'router', label: 'Router 0',
      lng: 0, lat: 0, version: 1, updatedAt: '', properties: {},
    })

    await expandNeighbors('el-0', 'Router 0')

    // Should have added neighbor nodes to graph
    expect(topologyStore.graph.order).toBeGreaterThan(1)
    // Should have added breadcrumb
    expect(explorationStore.breadcrumbs.length).toBeGreaterThanOrEqual(1)
    // Should track expanded node IDs
    expect(explorationStore.expandedNodeIds.size).toBeGreaterThan(0)
  })

  it('expandNeighbors does not commit side effects on fetch failure', async () => {
    // Override the neighbors endpoint to return 500
    server.use(
      http.get('/api/topology/elements/:id/neighbors', () => {
        return new HttpResponse(null, { status: 500 })
      }),
    )

    const { expandNeighbors } = await import('@/composables/use-exploration')
    const { useTopologyStore } = await import('@/stores/topology')
    const { useExplorationStore } = await import('@/stores/exploration')

    const topologyStore = useTopologyStore()
    const explorationStore = useExplorationStore()

    topologyStore.graph.addNode('el-0', {
      id: 'el-0', type: 'router', label: 'Router 0',
      lng: 0, lat: 0, version: 1, updatedAt: '', properties: {},
    })

    await expect(expandNeighbors('el-0', 'Router 0')).rejects.toThrow()

    // No side effects should have been committed
    expect(topologyStore.graph.order).toBe(1)
    expect(explorationStore.breadcrumbs).toHaveLength(0)
    expect(explorationStore.expandedNodeIds.size).toBe(0)
    expect(explorationStore.isExpanding).toBe(false)
  })

  it('expandNeighbors pins and clearExploration unpins', async () => {
    const { expandNeighbors } = await import('@/composables/use-exploration')
    const { useTopologyStore } = await import('@/stores/topology')
    const { useExplorationStore } = await import('@/stores/exploration')
    const { usePerformanceStore } = await import('@/stores/performance')

    const topologyStore = useTopologyStore()
    const explorationStore = useExplorationStore()
    const performanceStore = usePerformanceStore()

    topologyStore.graph.addNode('el-0', {
      id: 'el-0', type: 'router', label: 'Router 0',
      lng: 0, lat: 0, version: 1, updatedAt: '', properties: {},
    })

    await expandNeighbors('el-0', 'Router 0')

    const pinnedBefore = performanceStore.pinnedNodeIds.size
    expect(pinnedBefore).toBeGreaterThan(0)

    explorationStore.clearExploration()
    expect(performanceStore.pinnedNodeIds.size).toBe(0)
  })
})
