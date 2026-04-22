import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import Graph from 'graphology'
import type {
  NetworkElement,
  TopologyLink,
  TopologyCluster,
  TileElementsResponse,
  TileLinksResponse,
} from '@/types/topology'

export const useTopologyStore = defineStore('topology', () => {
  const graph = ref(new Graph({ multi: false, type: 'mixed' }))

  const nodeTileRefs = ref(new Map<string, Set<string>>())
  const edgeTileRefs = ref(new Map<string, Set<string>>())
  const tileGenerations = ref(new Map<string, number>())
  const clusters = ref(new Map<string, TopologyCluster>())
  const clusterTileRefs = ref(new Map<string, Set<string>>())
  /** Nodes that were pinned at eviction time and have zero tile refs — deferred for cleanup */
  const deferredEvictNodeIds = ref(new Set<string>())

  const nodeCount = ref(0)
  const edgeCount = ref(0)
  const clusterCount = computed(() => clusters.value.size)

  function mergeTileElements(tileKey: string, response: TileElementsResponse): boolean {
    const lastGen = tileGenerations.value.get(tileKey)
    if (lastGen !== undefined && response.generation < lastGen) {
      return false
    }
    tileGenerations.value.set(tileKey, response.generation)

    for (const id of response.removedIds) {
      if (graph.value.hasNode(id)) {
        graph.value.dropNode(id)
      }
      nodeTileRefs.value.delete(id)
    }

    for (const el of response.elements) {
      if (graph.value.hasNode(el.id)) {
        const currentVersion = graph.value.getNodeAttribute(el.id, 'version') as number
        if (el.version > currentVersion) {
          graph.value.replaceNodeAttributes(el.id, { ...el })
        }
      } else {
        graph.value.addNode(el.id, { ...el })
      }

      if (!nodeTileRefs.value.has(el.id)) {
        nodeTileRefs.value.set(el.id, new Set())
      }
      nodeTileRefs.value.get(el.id)!.add(tileKey)
    }

    // Clear previous cluster associations for this tile before applying fresh cluster payload.
    for (const [clusterId, tiles] of clusterTileRefs.value) {
      if (!tiles.has(tileKey)) continue
      tiles.delete(tileKey)
      if (tiles.size === 0) {
        clusterTileRefs.value.delete(clusterId)
        clusters.value.delete(clusterId)
      }
    }

    // Handle clusters from the response
    for (const cluster of response.clusters) {
      clusters.value.set(cluster.id, cluster)
      if (!clusterTileRefs.value.has(cluster.id)) {
        clusterTileRefs.value.set(cluster.id, new Set())
      }
      clusterTileRefs.value.get(cluster.id)!.add(tileKey)
    }
    nodeCount.value = graph.value.order
    edgeCount.value = graph.value.size
    return true
  }

  function mergeTileLinks(tileKey: string, response: TileLinksResponse) {
    for (const id of response.removedLinkIds) {
      if (graph.value.hasEdge(id)) {
        graph.value.dropEdge(id)
      }
      edgeTileRefs.value.delete(id)
    }

    for (const stub of response.stubs) {
      if (!graph.value.hasNode(stub.id)) {
        graph.value.addNode(stub.id, {
          id: stub.id,
          type: '__stub__',
          label: '',
          lng: stub.lng,
          lat: stub.lat,
          version: 0,
          updatedAt: '',
          properties: {},
          isStub: true,
        })
      }
      if (!nodeTileRefs.value.has(stub.id)) {
        nodeTileRefs.value.set(stub.id, new Set())
      }
      nodeTileRefs.value.get(stub.id)!.add(tileKey)
    }

    for (const link of response.links) {
      if (!graph.value.hasNode(link.sourceId) || !graph.value.hasNode(link.targetId)) {
        continue
      }

      if (graph.value.hasEdge(link.id)) {
        const currentVersion = graph.value.getEdgeAttribute(link.id, 'version') as number
        if (link.version > currentVersion) {
          // Directedness change requires drop+recreate (replaceEdgeAttributes can't change edge type)
          const isCurrentlyDirected = graph.value.isDirected(link.id)
          if (link.directed !== isCurrentlyDirected) {
            graph.value.dropEdge(link.id)
            if (link.directed) {
              graph.value.addDirectedEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link })
            } else {
              graph.value.addUndirectedEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link })
            }
          } else {
            graph.value.replaceEdgeAttributes(link.id, { ...link })
          }
        }
      } else {
        if (link.directed) {
          graph.value.addDirectedEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link })
        } else {
          graph.value.addUndirectedEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link })
        }
      }

      if (!edgeTileRefs.value.has(link.id)) {
        edgeTileRefs.value.set(link.id, new Set())
      }
      edgeTileRefs.value.get(link.id)!.add(tileKey)
    }
    nodeCount.value = graph.value.order
    edgeCount.value = graph.value.size
  }

  function evictTile(tileKey: string, pinnedNodeIds?: Set<string>) {
    tileGenerations.value.delete(tileKey)

    for (const [edgeId, tiles] of edgeTileRefs.value) {
      tiles.delete(tileKey)
      if (tiles.size === 0) {
        if (graph.value.hasEdge(edgeId)) {
          graph.value.dropEdge(edgeId)
        }
        edgeTileRefs.value.delete(edgeId)
      }
    }

    for (const [nodeId, tiles] of nodeTileRefs.value) {
      tiles.delete(tileKey)
      if (tiles.size === 0) {
        if (pinnedNodeIds?.has(nodeId)) {
          // Defer eviction — record for cleanup when unpinned
          deferredEvictNodeIds.value.add(nodeId)
          continue
        }
        if (graph.value.hasNode(nodeId)) {
          graph.value.dropNode(nodeId)
        }
        nodeTileRefs.value.delete(nodeId)
      }
    }

    // Evict clusters with no remaining tile refs
    for (const [clusterId, tiles] of clusterTileRefs.value) {
      tiles.delete(tileKey)
      if (tiles.size === 0) {
        clusters.value.delete(clusterId)
        clusterTileRefs.value.delete(clusterId)
      }
    }
    nodeCount.value = graph.value.order
    edgeCount.value = graph.value.size
  }

  function getElement(id: string): NetworkElement | null {
    if (!graph.value.hasNode(id)) return null
    return graph.value.getNodeAttributes(id) as unknown as NetworkElement
  }

  function getCluster(id: string): TopologyCluster | null {
    return clusters.value.get(id) ?? null
  }

  function getClusters(): TopologyCluster[] {
    return [...clusters.value.values()]
  }

  /**
   * Remove deferred-evict nodes that are no longer pinned.
   * Called when the pin set changes (e.g. selection cleared).
   */
  function pruneUnpinnedNodes(currentPinnedIds: Set<string>) {
    for (const nodeId of [...deferredEvictNodeIds.value]) {
      if (currentPinnedIds.has(nodeId)) continue
      // Node is no longer pinned and has zero tile refs — evict it
      deferredEvictNodeIds.value.delete(nodeId)
      const refs = nodeTileRefs.value.get(nodeId)
      if (refs && refs.size > 0) {
        // Re-acquired tile refs since deferral — no longer a candidate
        continue
      }
      if (graph.value.hasNode(nodeId)) {
        graph.value.dropNode(nodeId)
      }
      nodeTileRefs.value.delete(nodeId)
    }
    nodeCount.value = graph.value.order
    edgeCount.value = graph.value.size
  }

  function clear() {
    graph.value.clear()
    nodeTileRefs.value.clear()
    edgeTileRefs.value.clear()
    tileGenerations.value.clear()
    clusters.value.clear()
    clusterTileRefs.value.clear()
    deferredEvictNodeIds.value.clear()
    nodeCount.value = 0
    edgeCount.value = 0
  }

  return {
    graph, nodeTileRefs, edgeTileRefs, tileGenerations,
    clusters, clusterTileRefs,
    nodeCount, edgeCount, clusterCount,
    deferredEvictNodeIds,
    mergeTileElements, mergeTileLinks, evictTile, pruneUnpinnedNodes, getElement, getCluster, getClusters, clear,
  }
})
