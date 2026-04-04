import { useTopologyStore } from '@/stores/topology'
import { useExplorationStore } from '@/stores/exploration'
import { usePerformanceStore } from '@/stores/performance'
import { TileService } from '@/api/tile-service'
import { telemetry } from '@/utils/telemetry'

const tileService = new TileService()

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

    // Add breadcrumb for this exploration step
    explorationStore.pushBreadcrumb({ id: elementId, label: elementLabel })

    // Merge neighbor elements into the graph
    const newNodeIds: string[] = []
    for (const el of response.elements) {
      if (!topologyStore.graph.hasNode(el.id)) {
        topologyStore.graph.addNode(el.id, { ...el })
        newNodeIds.push(el.id)
      } else {
        const currentVersion = topologyStore.graph.getNodeAttribute(el.id, 'version') as number
        if (el.version > currentVersion) {
          topologyStore.graph.replaceNodeAttributes(el.id, { ...el })
        }
      }
    }

    // Merge neighbor links into the graph
    for (const link of response.links) {
      if (!topologyStore.graph.hasNode(link.sourceId) || !topologyStore.graph.hasNode(link.targetId)) {
        continue
      }
      if (topologyStore.graph.hasEdge(link.id)) {
        const currentVersion = topologyStore.graph.getEdgeAttribute(link.id, 'version') as number
        if (link.version > currentVersion) {
          topologyStore.graph.replaceEdgeAttributes(link.id, { ...link })
        }
      } else {
        if (link.directed) {
          topologyStore.graph.addDirectedEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link })
        } else {
          topologyStore.graph.addUndirectedEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link })
        }
      }
    }

    // Track expanded nodes and pin them
    explorationStore.addExpandedNodes(newNodeIds)
    if (newNodeIds.length > 0) {
      performanceStore.pinNodes(newNodeIds)
    }

    telemetry.emit('neighbor_expand_ms', performance.now() - start)
    telemetry.emit('neighbor_expand_count', response.elements.length)
  } finally {
    explorationStore.setExpanding(false)
  }
}
