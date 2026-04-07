import { useTopologyStore } from '@/stores/topology'
import { useExplorationStore } from '@/stores/exploration'
import { usePerformanceStore } from '@/stores/performance'
import { TileService } from '@/api/tile-service'
import { telemetry } from '@/utils/telemetry'
import type { NetworkElement, TopologyLink } from '@/types/topology'

const tileService = new TileService()

interface StagedMutation {
  addNodes: { id: string; attrs: NetworkElement }[]
  updateNodes: { id: string; attrs: NetworkElement }[]
  addEdges: { id: string; source: string; target: string; attrs: TopologyLink; directed: boolean }[]
  updateEdges: { id: string; attrs: TopologyLink }[]
  newNodeIds: string[]
}

/**
 * Validate and stage graph mutations without modifying the graph.
 * Returns the staged mutations to apply atomically.
 */
function stageGraphMutations(
  response: { elements: NetworkElement[]; links: TopologyLink[] },
  topologyStore: ReturnType<typeof useTopologyStore>,
): StagedMutation {
  const staged: StagedMutation = {
    addNodes: [],
    updateNodes: [],
    addEdges: [],
    updateEdges: [],
    newNodeIds: [],
  }

  // Track which node IDs will exist after applying staged node additions
  const pendingNodeIds = new Set<string>()

  for (const el of response.elements) {
    if (!topologyStore.graph.hasNode(el.id)) {
      staged.addNodes.push({ id: el.id, attrs: { ...el } })
      staged.newNodeIds.push(el.id)
      pendingNodeIds.add(el.id)
    } else {
      const currentVersion = topologyStore.graph.getNodeAttribute(el.id, 'version') as number
      if (el.version > currentVersion) {
        staged.updateNodes.push({ id: el.id, attrs: { ...el } })
      }
    }
  }

  for (const link of response.links) {
    const sourceExists = topologyStore.graph.hasNode(link.sourceId) || pendingNodeIds.has(link.sourceId)
    const targetExists = topologyStore.graph.hasNode(link.targetId) || pendingNodeIds.has(link.targetId)
    if (!sourceExists || !targetExists) continue

    if (topologyStore.graph.hasEdge(link.id)) {
      const currentVersion = topologyStore.graph.getEdgeAttribute(link.id, 'version') as number
      if (link.version > currentVersion) {
        staged.updateEdges.push({ id: link.id, attrs: { ...link } })
      }
    } else {
      staged.addEdges.push({
        id: link.id,
        source: link.sourceId,
        target: link.targetId,
        attrs: { ...link },
        directed: link.directed,
      })
    }
  }

  return staged
}

/**
 * Apply staged mutations to the graph. If any mutation fails,
 * roll back added nodes/edges and re-throw.
 */
function applyMutations(
  staged: StagedMutation,
  topologyStore: ReturnType<typeof useTopologyStore>,
): void {
  const addedNodeIds: string[] = []
  const addedEdgeIds: string[] = []

  try {
    for (const { id, attrs } of staged.addNodes) {
      topologyStore.graph.addNode(id, attrs)
      addedNodeIds.push(id)
    }
    for (const { id, attrs } of staged.updateNodes) {
      topologyStore.graph.replaceNodeAttributes(id, attrs)
    }
    for (const { id, source, target, attrs, directed } of staged.addEdges) {
      if (directed) {
        topologyStore.graph.addDirectedEdgeWithKey(id, source, target, attrs)
      } else {
        topologyStore.graph.addUndirectedEdgeWithKey(id, source, target, attrs)
      }
      addedEdgeIds.push(id)
    }
    for (const { id, attrs } of staged.updateEdges) {
      topologyStore.graph.replaceEdgeAttributes(id, attrs)
    }
  } catch (err) {
    // Rollback: remove added edges first, then nodes
    for (const edgeId of addedEdgeIds) {
      try { topologyStore.graph.dropEdge(edgeId) } catch { /* already removed */ }
    }
    for (const nodeId of addedNodeIds) {
      try { topologyStore.graph.dropNode(nodeId) } catch { /* already removed */ }
    }
    throw err
  }
}

export async function expandNeighbors(
  elementId: string,
  elementLabel: string,
  depth: number = 1,
): Promise<void> {
  const explorationStore = useExplorationStore()
  const topologyStore = useTopologyStore()
  const performanceStore = usePerformanceStore()

  if (!explorationStore.canExpand) return

  explorationStore.setExpanding(true)
  const start = performance.now()

  try {
    const response = await tileService.fetchNeighbors(elementId, depth)

    // Stage all mutations and validate before applying
    const staged = stageGraphMutations(response, topologyStore)

    // Apply mutations atomically (rolls back on failure)
    applyMutations(staged, topologyStore)

    // Only commit side effects after successful graph merge
    explorationStore.pushBreadcrumb({ id: elementId, label: elementLabel })
    explorationStore.addExpandedNodes(staged.newNodeIds)
    if (staged.newNodeIds.length > 0) {
      performanceStore.pinNodes(staged.newNodeIds)
    }

    telemetry.emit('neighbor_expand_ms', performance.now() - start)
    telemetry.emit('neighbor_expand_count', response.elements.length)
  } catch (err) {
    telemetry.emit('neighbor_expand_error', 1)
    throw err
  } finally {
    explorationStore.setExpanding(false)
  }
}
