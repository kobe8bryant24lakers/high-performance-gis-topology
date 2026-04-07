import { ref, watch, type Ref } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useViewModeStore } from '@/stores/view-mode'
import { computeLayout, type LayoutInput, type LayoutPosition } from '@/workers/layout-worker'
import { telemetry } from '@/utils/telemetry'
import type { NetworkElement } from '@/types/topology'

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

export function useForceLayout() {
  const topologyStore = useTopologyStore()
  const viewModeStore = useViewModeStore()

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

    isComputing.value = true
    const layoutStart = performance.now()

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
