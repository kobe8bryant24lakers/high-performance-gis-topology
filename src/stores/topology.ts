import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import Graph from 'graphology'
import type {
  NetworkElement,
  TopologyLink,
  TileElementsResponse,
  TileLinksResponse,
} from '@/types/topology'

export const useTopologyStore = defineStore('topology', () => {
  const graph = ref(new Graph({ multi: false, type: 'mixed' }))

  const nodeTileRefs = ref(new Map<string, Set<string>>())
  const edgeTileRefs = ref(new Map<string, Set<string>>())
  const tileGenerations = ref(new Map<string, number>())

  const nodeCount = computed(() => graph.value.order)
  const edgeCount = computed(() => graph.value.size)

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
          graph.value.replaceEdgeAttributes(link.id, { ...link })
        }
      } else {
        const edgeType = link.directed ? 'directed' : 'undirected'
        graph.value.addEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link, edgeType })
      }

      if (!edgeTileRefs.value.has(link.id)) {
        edgeTileRefs.value.set(link.id, new Set())
      }
      edgeTileRefs.value.get(link.id)!.add(tileKey)
    }
  }

  function evictTile(tileKey: string) {
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
        if (graph.value.hasNode(nodeId)) {
          graph.value.dropNode(nodeId)
        }
        nodeTileRefs.value.delete(nodeId)
      }
    }
  }

  function getElement(id: string): NetworkElement | null {
    if (!graph.value.hasNode(id)) return null
    return graph.value.getNodeAttributes(id) as unknown as NetworkElement
  }

  function clear() {
    graph.value.clear()
    nodeTileRefs.value.clear()
    edgeTileRefs.value.clear()
    tileGenerations.value.clear()
  }

  return {
    graph, nodeTileRefs, edgeTileRefs, tileGenerations,
    nodeCount, edgeCount,
    mergeTileElements, mergeTileLinks, evictTile, getElement, clear,
  }
})
