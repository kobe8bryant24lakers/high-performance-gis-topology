import { computed, shallowRef, watch } from 'vue'
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useViewModeStore } from '@/stores/view-mode'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { telemetry } from '@/utils/telemetry'
import type { NetworkElement, TopologyLink } from '@/types/topology'
import type { LayoutPosition } from '@/workers/layout-worker'

// Color per element type [R, G, B, A]
const TYPE_COLORS: Record<string, [number, number, number, number]> = {
  router:        [74,  222, 128, 220],  // green
  switch:        [96,  165, 250, 220],  // blue
  server:        [167, 139, 250, 220],  // purple
  firewall:      [248, 113, 113, 220],  // red
  'access-point':[250, 204,  21, 220],  // yellow
}
const DEFAULT_COLOR: [number, number, number, number] = [100, 149, 237, 220]

// Unicode label per type
const TYPE_LABELS: Record<string, string> = {
  router:         'R',
  switch:         'S',
  server:         'Sv',
  firewall:       'F',
  'access-point': 'AP',
}

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

  const cachedNodes = shallowRef<NodeWithStub[]>([])
  const cachedEdges = shallowRef<EdgeData[]>([])

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
      return [0, 0]
    }
    return [node.lng, node.lat]
  }

  const layers = computed(() => {
    const layerBuildStart = performance.now()
    const allLayers: any[] = []
    const nodes = cachedNodes.value
    const edges = cachedEdges.value
    const { hoverEnabled, pickEnabled, degradationLevel } = performanceStore

    // Link layer
    allLayers.push(
      new LineLayer({
        id: 'links',
        data: edges,
        getSourcePosition: (d: EdgeData) => getNodePosition(d.source),
        getTargetPosition: (d: EdgeData) => getNodePosition(d.target),
        getColor: (d: EdgeData) => {
          if (d.source.isStub || d.target.isStub) return [100, 116, 139, 90]
          return [148, 163, 184, 200]
        },
        getWidth: 1.5,
        widthUnits: 'pixels' as const,
        updateTriggers: {
          getSourcePosition: [viewModeStore.mode, layoutPositions?.()],
          getTargetPosition: [viewModeStore.mode, layoutPositions?.()],
        },
      }),
    )

    // Selection halo — skip at minimal (50k+ nodes, halo draw cost not justified)
    if (degradationLevel !== 'minimal') allLayers.push(
      new ScatterplotLayer({
        id: 'node-halos',
        data: nodes.filter((n) => !n.isStub && selectionStore.selectedIds.has(n.id)),
        getPosition: (d: NodeWithStub) => getNodePosition(d),
        getRadius: 10,
        getFillColor: [255, 140, 0, 60],
        getLineColor: [255, 140, 0, 220],
        getLineWidth: 2,
        lineWidthUnits: 'pixels' as const,
        stroked: true,
        filled: true,
        radiusUnits: 'pixels' as const,
        updateTriggers: {
          data: [selectionStore.selectedIds],
          getPosition: [viewModeStore.mode, layoutPositions?.()],
        },
      }),
    )

    // Node circles with type-based colors
    allLayers.push(
      new ScatterplotLayer({
        id: 'nodes',
        data: nodes,
        getPosition: (d: NodeWithStub) => getNodePosition(d),
        getRadius: (d: NodeWithStub) => (d.isStub ? 3 : 7),
        getFillColor: (d: NodeWithStub) => {
          if (d.isStub) return [150, 150, 150, 100]
          return TYPE_COLORS[d.type] ?? DEFAULT_COLOR
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

    // Type label layer — only at full fidelity (< 10k nodes)
    if (degradationLevel === 'full') allLayers.push(
      new TextLayer({
        id: 'node-labels',
        data: nodes.filter((n) => !n.isStub),
        getPosition: (d: NodeWithStub) => getNodePosition(d),
        getText: (d: NodeWithStub) => TYPE_LABELS[d.type] ?? d.type.slice(0, 2).toUpperCase(),
        getSize: 8,
        getColor: [255, 255, 255, 220],
        getTextAnchor: 'middle' as const,
        getAlignmentBaseline: 'center' as const,
        fontFamily: 'monospace',
        updateTriggers: {
          getPosition: [viewModeStore.mode, layoutPositions?.()],
        },
      }),
    )

    telemetry.emit('layer_rebuild_ms', performance.now() - layerBuildStart)
    return allLayers
  })

  return { layers }
}
