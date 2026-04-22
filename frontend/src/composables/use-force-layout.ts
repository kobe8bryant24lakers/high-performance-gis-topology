import { ref, watch, type Ref } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useViewModeStore } from '@/stores/view-mode'
import { usePerformanceStore } from '@/stores/performance'
import { computeLayout, type LayoutInput, type LayoutPosition } from '@/workers/layout-worker'
import { telemetry } from '@/utils/telemetry'
import type { NetworkElement } from '@/types/topology'

const FORCE_LAYOUT_NODE_LIMIT = 5_000
const SCHEMATIC_X_EXTENT = 900
const SCHEMATIC_Y_EXTENT = 500
const MAX_ABS_LNG = 180
const MAX_ABS_LAT = 85.051129

export function extractLayoutInput(topologyStore: ReturnType<typeof useTopologyStore>): LayoutInput {
  const nodes: LayoutInput['nodes'] = []
  const edges: LayoutInput['edges'] = []

  topologyStore.graph.forEachNode((id, attrs) => {
    const el = attrs as NetworkElement & { isStub?: boolean }
    if (el.isStub) return
    nodes.push({ id, x: el.lng ?? 0, y: el.lat ?? 0 })
  })

  const nodeIds = new Set(nodes.map((n) => n.id))

  topologyStore.graph.forEachEdge((_id, _attrs, source, target) => {
    if (nodeIds.has(source) && nodeIds.has(target)) {
      edges.push({ source, target })
    }
  })

  return { nodes, edges, iterations: 300 }
}

export function projectNodesToSchematicPositions(nodes: LayoutInput['nodes']): LayoutPosition[] {
  if (nodes.length === 0) return []

  return nodes.map((node) => ({
    id: node.id,
    ...projectNodeToSchematicPosition(node.x, node.y),
  }))
}

export function projectNodeToSchematicPosition(lng: number, lat: number): Omit<LayoutPosition, 'id'> {
  return {
    x: (lng / MAX_ABS_LNG) * SCHEMATIC_X_EXTENT,
    y: -(lat / MAX_ABS_LAT) * SCHEMATIC_Y_EXTENT,
  }
}

export interface SchematicViewState {
  target: [number, number, number]
  zoom: number
}

export function computeSchematicViewState(
  positions: LayoutPosition[],
  width: number,
  height: number,
): SchematicViewState {
  if (positions.length === 0 || width <= 0 || height <= 0) {
    return {
      target: [0, 0, 0],
      zoom: 0,
    }
  }

  const xs = positions.map((position) => position.x)
  const ys = positions.map((position) => position.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const paddedX = spanX * 1.2
  const paddedY = spanY * 1.2
  const zoomX = Math.log2(width / paddedX)
  const zoomY = Math.log2(height / paddedY)

  return {
    target: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
    zoom: Math.min(zoomX, zoomY, 1),
  }
}

export function useForceLayout() {
  const topologyStore = useTopologyStore()
  const viewModeStore = useViewModeStore()
  const performanceStore = usePerformanceStore()

  const positions = ref(new Map<string, LayoutPosition>()) as Ref<Map<string, LayoutPosition>>
  const isComputing = ref(false)

  let worker: Worker | null = null
  let layoutDebounce: ReturnType<typeof setTimeout> | null = null

  function runLayout() {
    if (!viewModeStore.isSchematic) return

    const input = extractLayoutInput(topologyStore)
    if (input.nodes.length === 0) {
      positions.value = new Map()
      return
    }

    // Preserve existing positions for nodes that already have them (incremental layout)
    for (const node of input.nodes) {
      const existing = positions.value.get(node.id)
      if (existing) {
        node.x = existing.x
        node.y = existing.y
      }
    }

    const layoutStart = performance.now()

    if (
      input.nodes.length > FORCE_LAYOUT_NODE_LIMIT ||
      performanceStore.degradationLevel !== 'full'
    ) {
      positions.value = new Map(
        projectNodesToSchematicPositions(input.nodes).map((p) => [p.id, p]),
      )
      isComputing.value = false
      telemetry.emit('worker_layout_ms', performance.now() - layoutStart)
      return
    }

    isComputing.value = true

    if (typeof Worker !== 'undefined' && !import.meta.env.TEST) {
      worker?.terminate()
      worker = new Worker(new URL('../workers/layout-worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        const result = e.data
        positions.value = new Map(result.positions.map((p: LayoutPosition) => [p.id, p]))
        isComputing.value = false
        telemetry.emit('worker_layout_ms', performance.now() - layoutStart)
      }
      worker.postMessage(input)
    } else {
      const result = computeLayout(input)
      positions.value = new Map(result.positions.map((p) => [p.id, p]))
      isComputing.value = false
      telemetry.emit('worker_layout_ms', performance.now() - layoutStart)
    }
  }

  function debouncedRunLayout() {
    if (layoutDebounce) clearTimeout(layoutDebounce)
    layoutDebounce = setTimeout(runLayout, 300)
  }

  function getPosition(id: string): LayoutPosition | undefined {
    return positions.value.get(id)
  }

  function updatePosition(id: string, x: number, y: number) {
    const pos = positions.value.get(id)
    if (pos) {
      positions.value.set(id, { ...pos, x, y })
      positions.value = new Map(positions.value)
    }
  }

  function dispose() {
    worker?.terminate()
    worker = null
    if (layoutDebounce) clearTimeout(layoutDebounce)
  }

  // Re-run layout when switching to schematic mode
  watch(
    () => viewModeStore.isSchematic,
    (isSchematic) => {
      if (isSchematic) runLayout()
    },
  )

  // Re-run layout when graph content changes while in schematic mode
  watch(
    () => [topologyStore.nodeCount, topologyStore.edgeCount],
    () => {
      if (viewModeStore.isSchematic) debouncedRunLayout()
    },
  )

  return { positions, isComputing, runLayout, getPosition, updatePosition, dispose }
}
