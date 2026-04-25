import { computed, shallowRef, watch } from 'vue'
import { IconLayer, LineLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { useRegionStore } from '@/stores/regions'
import { telemetry } from '@/utils/telemetry'
import { getNeIconSpec, toDeckColor } from '@/constants/ne-icons'
import type { NetworkElement, RegionSummary, RegionVirtualLink, TopologyLink } from '@/types/topology'

type NodeWithStub = NetworkElement & { isStub?: boolean }
interface EdgeData { source: NodeWithStub; target: NodeWithStub; link: TopologyLink }
interface RegionEdgeData { source: RegionSummary; target: RegionSummary; link: RegionVirtualLink }

export function useDeckLayers(
  onElementClick: (id: string, event?: PointerEvent) => void,
  onElementHover: (id: string | null) => void,
) {
  const topologyStore = useTopologyStore()
  const selectionStore = useSelectionStore()
  const filterStore = useFilterStore()
  const performanceStore = usePerformanceStore()
  const regionStore = useRegionStore()

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

  function getRegionPosition(region: RegionSummary): [number, number] {
    return [region.centroidLng, region.centroidLat]
  }

  function getRegionPolygon(region: RegionSummary): [number, number][] {
    const { west, south, east, north } = region.bbox
    return [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
    ]
  }

  function compactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
    return `${value}`
  }

  function formatRegionLabel(region: RegionSummary): string {
    const counts = region.elementTypes
    return [
      region.name,
      `${compactNumber(region.totalCount)} devices`,
      `FW ${compactNumber(counts.firewall ?? 0)}  RT ${compactNumber(counts.router ?? 0)}`,
      `SW ${compactNumber(counts.switch ?? 0)}  SRV ${compactNumber(counts.server ?? 0)}  AP ${compactNumber(counts['access-point'] ?? 0)}`,
    ].join('\n')
  }

  const layers = computed(() => {
    const layerBuildStart = performance.now()
    const allLayers: any[] = []
    const regions = regionStore.regionsList
    if (regions.length > 0) {
      const regionById = new Map(regions.map((region) => [region.id, region]))
      const regionEdges: RegionEdgeData[] = regionStore.links
        .map((link) => {
          const source = regionById.get(link.sourceRegionId)
          const target = regionById.get(link.targetRegionId)
          if (!source || !target) return null
          return { source, target, link }
        })
        .filter((edge): edge is RegionEdgeData => edge !== null)

      allLayers.push(
        new LineLayer<RegionEdgeData>({
          id: 'region-virtual-links',
          data: regionEdges,
          getSourcePosition: (d) => getRegionPosition(d.source),
          getTargetPosition: (d) => getRegionPosition(d.target),
          getColor: [96, 165, 250, 180],
          getWidth: (d) => Math.min(8, Math.max(1.5, Math.log10(d.link.count + 1) * 1.8)),
          widthUnits: 'pixels' as const,
        }),
      )

      allLayers.push(
        new PolygonLayer<RegionSummary>({
          id: 'region-boundaries',
          data: regions,
          getPolygon: getRegionPolygon,
          getFillColor: [37, 99, 235, 18],
          getLineColor: [125, 211, 252, 145],
          getLineWidth: 1,
          lineWidthUnits: 'pixels' as const,
          stroked: true,
          filled: true,
        }),
      )

      allLayers.push(
        new TextLayer<RegionSummary>({
          id: 'region-summary-labels',
          data: regions,
          getPosition: getRegionPosition,
          getText: formatRegionLabel,
          getSize: 12,
          sizeUnits: 'pixels' as const,
          getColor: [226, 232, 240, 255],
          getTextAnchor: 'middle' as const,
          getAlignmentBaseline: 'center' as const,
          background: true,
          getBackgroundColor: [15, 23, 42, 220],
          backgroundPadding: [8, 6] as [number, number],
          pickable: false,
        }),
      )

      telemetry.emit('layer_rebuild_ms', performance.now() - layerBuildStart)
      return allLayers
    }

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

    if (degradationLevel === 'full') allLayers.push(
      new ScatterplotLayer<NodeWithStub>({
        id: 'node-presence-halos',
        data: visibleRealNodes,
        getPosition: (d) => getNodePosition(d),
        getRadius: 18,
        getFillColor: (d) => toDeckColor(d.type, 50),
        getLineColor: (d) => toDeckColor(d.type, 190),
        getLineWidth: 1.5,
        lineWidthUnits: 'pixels' as const,
        stroked: true,
        filled: true,
        radiusUnits: 'pixels' as const,
        pickable: false,
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
        getSize: degradationLevel === 'minimal' ? 18 : 30,
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
