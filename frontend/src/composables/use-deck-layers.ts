import { computed, shallowRef, watch } from 'vue'
import { IconLayer, LineLayer, ScatterplotLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useViewModeStore } from '@/stores/view-mode'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { telemetry } from '@/utils/telemetry'
import { getNeIconSpec } from '@/constants/ne-icons'
import { projectNodeToSchematicPosition } from '@/composables/use-force-layout'
import type { NetworkElement, TopologyLink } from '@/types/topology'
import type { LayoutPosition } from '@/workers/layout-worker'

type NodeWithStub = NetworkElement & { isStub?: boolean }
interface EdgeData { source: NodeWithStub; target: NodeWithStub; link: TopologyLink }

const SCHEMATIC_REDUCED_NODE_LIMIT = 6_000
const SCHEMATIC_MINIMAL_NODE_LIMIT = 2_500
const SCHEMATIC_STUB_LIMIT = 1_000

function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items
  if (limit <= 0) return []

  const sampled: T[] = []
  const stride = items.length / limit
  for (let i = 0; i < limit; i++) {
    sampled.push(items[Math.floor(i * stride)]!)
  }
  return sampled
}

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
      const projected = projectNodeToSchematicPosition(node.lng, node.lat)
      return [projected.x, projected.y]
    }
    return [node.lng, node.lat]
  }

  const layers = computed(() => {
    const layerBuildStart = performance.now()
    const allLayers: any[] = []
    const nodes = cachedNodes.value
    const edges = cachedEdges.value
    const { hoverEnabled, pickEnabled, degradationLevel } = performanceStore
    const isDenseSchematic = viewModeStore.isSchematic && degradationLevel !== 'full'
    const schematicNodeLimit = degradationLevel === 'minimal'
      ? SCHEMATIC_MINIMAL_NODE_LIMIT
      : SCHEMATIC_REDUCED_NODE_LIMIT
    const visibleRealNodes = isDenseSchematic
      ? sampleEvenly(nodes.filter((n) => !n.isStub), schematicNodeLimit)
      : nodes.filter((n) => !n.isStub)
    const visibleStubNodes = isDenseSchematic
      ? sampleEvenly(nodes.filter((n) => n.isStub), SCHEMATIC_STUB_LIMIT)
      : nodes.filter((n) => n.isStub)
    const visibleEdges = isDenseSchematic ? [] : edges

    // Link layer
    allLayers.push(
      new LineLayer({
        id: 'links',
        data: visibleEdges,
        getSourcePosition: (d: EdgeData) => getNodePosition(d.source),
        getTargetPosition: (d: EdgeData) => getNodePosition(d.target),
        getColor: (d: EdgeData) => {
          if (isDenseSchematic) return [148, 163, 184, 28]
          if (d.source.isStub || d.target.isStub) return [100, 116, 139, 90]
          return [148, 163, 184, 200]
        },
        getWidth: isDenseSchematic ? 0.75 : 1.5,
        widthUnits: 'pixels' as const,
        updateTriggers: {
          getSourcePosition: [viewModeStore.mode, layoutPositions?.()],
          getTargetPosition: [viewModeStore.mode, layoutPositions?.()],
          getColor: [isDenseSchematic],
          getWidth: [isDenseSchematic],
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

    // Endpoint stubs stay lightweight as circles.
    allLayers.push(
      new ScatterplotLayer({
        id: 'node-stubs',
        data: visibleStubNodes,
        getPosition: (d: NodeWithStub) => getNodePosition(d),
        getRadius: 3,
        getFillColor: [150, 150, 150, 100],
        radiusUnits: 'pixels' as const,
        updateTriggers: {
          getPosition: [viewModeStore.mode, layoutPositions?.()],
        },
      }),
    )

    allLayers.push(
      new IconLayer<NodeWithStub>({
        id: 'node-icons',
        data: visibleRealNodes,
        getPosition: (d: NodeWithStub) => getNodePosition(d),
        getIcon: (d: NodeWithStub) => ({
          url: getNeIconSpec(d.type).iconUrl,
          width: 64,
          height: 64,
          anchorY: 32,
        }),
        getColor: [255, 255, 255, 255],
        getSize: isDenseSchematic ? 22 : degradationLevel === 'minimal' ? 14 : 18,
        sizeUnits: 'pixels' as const,
        alphaCutoff: 0.05,
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
          getIcon: [nodes],
          getPosition: [viewModeStore.mode, layoutPositions?.()],
          getSize: [degradationLevel],
        },
      }),
    )

    telemetry.emit('layer_rebuild_ms', performance.now() - layerBuildStart)
    return allLayers
  })

  return { layers }
}
