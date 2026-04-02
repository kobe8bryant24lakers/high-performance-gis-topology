// src/composables/use-deck-layers.ts
import { computed } from 'vue'
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useViewModeStore } from '@/stores/view-mode'
import { useFilterStore } from '@/stores/filter'
import type { NetworkElement, TopologyLink, TopologyCluster } from '@/types/topology'
import type { LayoutPosition } from '@/workers/layout-worker'

export function useDeckLayers(
  onElementClick: (id: string, event?: PointerEvent) => void,
  onElementHover: (id: string | null) => void,
  layoutPositions?: () => Map<string, LayoutPosition>,
) {
  const topologyStore = useTopologyStore()
  const selectionStore = useSelectionStore()
  const viewModeStore = useViewModeStore()
  const filterStore = useFilterStore()

  function getNodePosition(node: NetworkElement & { isStub?: boolean }): [number, number] {
    if (viewModeStore.isSchematic && layoutPositions) {
      const pos = layoutPositions().get(node.id)
      if (pos) return [pos.x, pos.y]
    }
    return [node.lng, node.lat]
  }

  const layers = computed(() => {
    const allLayers: any[] = []

    // Collect and filter nodes
    const nodes: (NetworkElement & { isStub?: boolean })[] = []
    topologyStore.graph.forEachNode((_id, attrs) => {
      const el = attrs as NetworkElement & { isStub?: boolean }
      if (!el.isStub && filterStore.hasActiveFilters && !filterStore.matchesElement(el)) return
      nodes.push(el)
    })

    // Collect edges
    const edges: { source: NetworkElement; target: NetworkElement; link: TopologyLink }[] = []
    topologyStore.graph.forEachEdge((_id, attrs, _source, _target, sourceAttrs, targetAttrs) => {
      edges.push({
        source: sourceAttrs as unknown as NetworkElement,
        target: targetAttrs as unknown as NetworkElement,
        link: attrs as unknown as TopologyLink,
      })
    })

    // Link layer
    allLayers.push(
      new LineLayer({
        id: 'links',
        data: edges,
        getSourcePosition: (d: { source: NetworkElement & { isStub?: boolean } }) => getNodePosition(d.source),
        getTargetPosition: (d: { target: NetworkElement & { isStub?: boolean } }) => getNodePosition(d.target),
        getColor: (d: { source: NetworkElement & { isStub?: boolean }; target: NetworkElement & { isStub?: boolean } }) => {
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
        getPosition: (d: NetworkElement & { isStub?: boolean }) => getNodePosition(d),
        getRadius: (d: NetworkElement & { isStub?: boolean }) => (d.isStub ? 3 : 6),
        getFillColor: (d: NetworkElement & { isStub?: boolean }) => {
          if (d.isStub) return [150, 150, 150, 100]
          if (selectionStore.selectedIds.has(d.id)) return [255, 140, 0, 255]
          return [0, 128, 255, 200]
        },
        radiusUnits: 'pixels' as const,
        pickable: true,
        onClick: (info: { object?: NetworkElement; srcEvent?: PointerEvent }) => {
          if (info.object) onElementClick(info.object.id, info.srcEvent)
        },
        onHover: (info: { object?: NetworkElement }) => {
          onElementHover(info.object?.id ?? null)
        },
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
        new ScatterplotLayer({
          id: 'clusters',
          data: clusters,
          getPosition: (d: TopologyCluster) => [d.centroidLng, d.centroidLat],
          getRadius: (d: TopologyCluster) => Math.min(40, 10 + Math.sqrt(d.count) * 2),
          getFillColor: [255, 200, 50, 180] as any,
          radiusUnits: 'pixels' as const,
          pickable: true,
          onClick: (info: { object?: TopologyCluster }) => {
            // Cluster click — could zoom in, for now no-op
          },
        }),
      )

      // Cluster count labels
      allLayers.push(
        new TextLayer({
          id: 'cluster-labels',
          data: clusters,
          getPosition: (d: TopologyCluster) => [d.centroidLng, d.centroidLat],
          getText: (d: TopologyCluster) => String(d.count),
          getSize: 12,
          getColor: [30, 30, 30, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          fontFamily: 'sans-serif',
          fontWeight: 700,
        }),
      )
    }

    return allLayers
  })

  return { layers }
}
