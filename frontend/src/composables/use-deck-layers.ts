import { computed, shallowRef, watch } from 'vue'
import { IconLayer, LineLayer, ScatterplotLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { telemetry } from '@/utils/telemetry'
import { getNeIconSpec } from '@/constants/ne-icons'
import type { NetworkElement, TopologyLink } from '@/types/topology'

type NodeWithStub = NetworkElement & { isStub?: boolean }
interface EdgeData { source: NodeWithStub; target: NodeWithStub; link: TopologyLink }

export function useDeckLayers(
  onElementClick: (id: string, event?: PointerEvent) => void,
  onElementHover: (id: string | null) => void,
) {
  const topologyStore = useTopologyStore()
  const selectionStore = useSelectionStore()
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
    return [node.lng, node.lat]
  }

  const layers = computed(() => {
    const layerBuildStart = performance.now()
    const allLayers: any[] = []
    const nodes = cachedNodes.value
    const edges = cachedEdges.value
    const { hoverEnabled, pickEnabled, degradationLevel } = performanceStore
    const visibleRealNodes = nodes.filter((n) => !n.isStub)
    const visibleStubNodes = nodes.filter((n) => n.isStub)
    const visibleEdges = edges

    // Link layer
    allLayers.push(
      new LineLayer({
        id: 'links',
        data: visibleEdges,
        getSourcePosition: (d: EdgeData) => getNodePosition(d.source),
        getTargetPosition: (d: EdgeData) => getNodePosition(d.target),
        getColor: (d: EdgeData) => {
          if (d.source.isStub || d.target.isStub) return [100, 116, 139, 90]
          return [148, 163, 184, 200]
        },
        getWidth: 1.5,
        widthUnits: 'pixels' as const,
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
          mask: false,
        }),
        getSize: degradationLevel === 'minimal' ? 18 : 22,
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
          getSize: [degradationLevel],
        },
      }),
    )

    telemetry.emit('layer_rebuild_ms', performance.now() - layerBuildStart)
    return allLayers
  })

  return { layers }
}
