import { computed, shallowRef, watch } from 'vue'
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useViewModeStore } from '@/stores/view-mode'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { telemetry } from '@/utils/telemetry'
import type { NetworkElement, TopologyLink, TopologyCluster } from '@/types/topology'
import type { LayoutPosition } from '@/workers/layout-worker'

type NodeWithStub = NetworkElement & { isStub?: boolean }
interface EdgeData { source: NodeWithStub; target: NodeWithStub; link: TopologyLink }

export function useDeckLayers(
  onElementClick: (id: string, event?: PointerEvent) => void,
  onElementHover: (id: string | null) => void,
  layoutPositions?: () => Map<string, LayoutPosition>,
) {
  const topologyStore = useTopologyStore()
  const selectionStore = useSelectionStore()
  const viewModeStore = useViewModeStore()
  const filterStore = useFilterStore()
  const performanceStore = usePerformanceStore()

  // Cache collected data to avoid rebuilding on every selection/position change
  const cachedNodes = shallowRef<NodeWithStub[]>([])
  const cachedEdges = shallowRef<EdgeData[]>([])

  // Rebuild node/edge arrays only when graph or filters change
  watch(
    () => [topologyStore.nodeCount, topologyStore.edgeCount, JSON.stringify(filterStore.criteria.types), JSON.stringify(filterStore.criteria.propertyFilters)],
    () => {
      const nodes: NodeWithStub[] = []
      topologyStore.graph.forEachNode((_id, attrs) => {
        const el = attrs as NodeWithStub
        if (!el.isStub && filterStore.hasActiveFilters && !filterStore.matchesElement(el)) return
        nodes.push(el)
      })
      cachedNodes.value = nodes

      const edges: EdgeData[] = []
      topologyStore.graph.forEachEdge((_id, attrs, _source, _target, sourceAttrs, targetAttrs) => {
        edges.push({
          source: sourceAttrs as unknown as NodeWithStub,
          target: targetAttrs as unknown as NodeWithStub,
          link: attrs as unknown as TopologyLink,
        })
      })
      cachedEdges.value = edges
    },
    { immediate: true },
  )

  function getNodePosition(node: NodeWithStub): [number, number] {
    if (viewModeStore.isSchematic && layoutPositions) {
      const pos = layoutPositions().get(node.id)
      if (pos) return [pos.x, pos.y]
      // No layout position yet — place at origin rather than mixing geo coords
      return [0, 0]
    }
    return [node.lng, node.lat]
  }

  const layers = computed(() => {
    const layerBuildStart = performance.now()
    const allLayers: any[] = []
    const nodes = cachedNodes.value
    const edges = cachedEdges.value
    const { hoverEnabled, pickEnabled } = performanceStore

    // Link layer
    allLayers.push(
      new LineLayer({
        id: 'links',
        data: edges,
        getSourcePosition: (d: EdgeData) => getNodePosition(d.source),
        getTargetPosition: (d: EdgeData) => getNodePosition(d.target),
        getColor: (d: EdgeData) => {
          if (d.source.isStub || d.target.isStub) return [150, 150, 150, 80]
          return [100, 100, 100, 160]
        },
        getWidth: 1,
        widthUnits: 'pixels' as const,
        updateTriggers: {
          getSourcePosition: [viewModeStore.mode, layoutPositions?.()],
          getTargetPosition: [viewModeStore.mode, layoutPositions?.()],
        },
      }),
    )

    // Node layer
    allLayers.push(
      new ScatterplotLayer({
        id: 'nodes',
        data: nodes,
        getPosition: (d: NodeWithStub) => getNodePosition(d),
        getRadius: (d: NodeWithStub) => (d.isStub ? 3 : 6),
        getFillColor: (d: NodeWithStub) => {
          if (d.isStub) return [150, 150, 150, 100]
          if (selectionStore.selectedIds.has(d.id)) return [255, 140, 0, 255]
          return [0, 128, 255, 200]
        },
        radiusUnits: 'pixels' as const,
        pickable: pickEnabled,
        onClick: pickEnabled
          ? (info: { object?: NetworkElement; srcEvent?: PointerEvent }) => {
              if (info.object) onElementClick(info.object.id, info.srcEvent)
            }
          : undefined,
        onHover: hoverEnabled
          ? (info: { object?: NetworkElement }) => {
              onElementHover(info.object?.id ?? null)
            }
          : undefined,
        updateTriggers: {
          getFillColor: [selectionStore.selectedIds],
          getPosition: [viewModeStore.mode, layoutPositions?.()],
        },
      }),
    )

    // Cluster layer (geo mode only, when clusters present)
    const clusters = topologyStore.getClusters()
    if (clusters.length > 0 && !viewModeStore.isSchematic) {
      allLayers.push(
        new ScatterplotLayer<TopologyCluster>({
          id: 'clusters',
          data: clusters,
          getPosition: (d: TopologyCluster) => [d.centroidLng, d.centroidLat],
          getRadius: (d: TopologyCluster) => Math.min(40, 10 + Math.sqrt(d.count) * 2),
          getFillColor: [255, 200, 50, 180] as [number, number, number, number],
          radiusUnits: 'pixels' as const,
          pickable: true,
        }),
      )

      allLayers.push(
        new TextLayer<TopologyCluster>({
          id: 'cluster-labels',
          data: clusters,
          getPosition: (d: TopologyCluster) => [d.centroidLng, d.centroidLat],
          getText: (d: TopologyCluster) => String(d.count),
          getSize: 12,
          getColor: [30, 30, 30, 255] as [number, number, number, number],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          fontFamily: 'sans-serif',
          fontWeight: 700,
        }),
      )
    }

    telemetry.emit('layer_rebuild_ms', performance.now() - layerBuildStart)
    return allLayers
  })

  return { layers }
}
