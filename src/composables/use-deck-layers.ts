import { computed } from 'vue'
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import type { NetworkElement, TopologyLink } from '@/types/topology'

export function useDeckLayers(onElementClick: (id: string) => void, onElementHover: (id: string | null) => void) {
  const topologyStore = useTopologyStore()
  const selectionStore = useSelectionStore()

  const layers = computed(() => {
    const nodes: (NetworkElement & { isStub?: boolean })[] = []
    const edges: { source: NetworkElement; target: NetworkElement; link: TopologyLink }[] = []

    topologyStore.graph.forEachNode((id, attrs) => {
      nodes.push(attrs as NetworkElement & { isStub?: boolean })
    })

    topologyStore.graph.forEachEdge((id, attrs, source, target, sourceAttrs, targetAttrs) => {
      edges.push({
        source: sourceAttrs as unknown as NetworkElement,
        target: targetAttrs as unknown as NetworkElement,
        link: attrs as unknown as TopologyLink,
      })
    })

    const nodeLayer = new ScatterplotLayer({
      id: 'nodes',
      data: nodes,
      getPosition: (d: NetworkElement) => [d.lng, d.lat],
      getRadius: (d: NetworkElement & { isStub?: boolean }) => d.isStub ? 3 : 6,
      getFillColor: (d: NetworkElement & { isStub?: boolean }) => {
        if (d.isStub) return [150, 150, 150, 100]
        if (selectionStore.selectedIds.has(d.id)) return [255, 140, 0, 255]
        return [0, 128, 255, 200]
      },
      radiusUnits: 'pixels' as const,
      pickable: true,
      onClick: (info: { object?: NetworkElement }) => {
        if (info.object) onElementClick(info.object.id)
      },
      onHover: (info: { object?: NetworkElement }) => {
        onElementHover(info.object?.id ?? null)
      },
      updateTriggers: {
        getFillColor: [selectionStore.selectedIds],
      },
    })

    const linkLayer = new LineLayer({
      id: 'links',
      data: edges,
      getSourcePosition: (d: { source: NetworkElement }) => [d.source.lng, d.source.lat],
      getTargetPosition: (d: { target: NetworkElement }) => [d.target.lng, d.target.lat],
      getColor: (d: { source: NetworkElement & { isStub?: boolean }; target: NetworkElement & { isStub?: boolean } }) => {
        if (d.source.isStub || d.target.isStub) return [150, 150, 150, 80]
        return [100, 100, 100, 160]
      },
      getWidth: 1,
      widthUnits: 'pixels' as const,
    })

    return [linkLayer, nodeLayer]
  })

  return { layers }
}
