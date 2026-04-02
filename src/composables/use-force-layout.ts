// src/composables/use-force-layout.ts
import { ref, watch, type Ref } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useViewModeStore } from '@/stores/view-mode'
import { computeLayout, type LayoutInput, type LayoutPosition } from '@/workers/layout-worker'

export function extractLayoutInput(topologyStore: ReturnType<typeof useTopologyStore>): LayoutInput {
  const nodes: LayoutInput['nodes'] = []
  const edges: LayoutInput['edges'] = []

  topologyStore.graph.forEachNode((id, attrs) => {
    if ((attrs as any).isStub) return
    nodes.push({ id, x: (attrs as any).lng ?? 0, y: (attrs as any).lat ?? 0 })
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

  function runLayout() {
    if (!viewModeStore.isSchematic) return

    const input = extractLayoutInput(topologyStore)
    if (input.nodes.length === 0) {
      positions.value = new Map()
      return
    }

    isComputing.value = true

    // Use Web Worker if available, fall back to synchronous
    if (typeof Worker !== 'undefined' && !import.meta.env.TEST) {
      worker?.terminate()
      worker = new Worker(new URL('../workers/layout-worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        const result = e.data
        positions.value = new Map(result.positions.map((p: LayoutPosition) => [p.id, p]))
        isComputing.value = false
      }
      worker.postMessage(input)
    } else {
      // Synchronous fallback for tests
      const result = computeLayout(input)
      positions.value = new Map(result.positions.map((p) => [p.id, p]))
      isComputing.value = false
    }
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
  }

  watch(
    () => viewModeStore.isSchematic,
    (isSchematic) => {
      if (isSchematic) runLayout()
    },
  )

  return { positions, isComputing, runLayout, getPosition, updatePosition, dispose }
}
