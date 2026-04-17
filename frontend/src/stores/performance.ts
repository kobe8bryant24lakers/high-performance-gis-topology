// src/stores/performance.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type DegradationLevel = 'full' | 'reduced' | 'minimal'
export type MemoryPressure = 'normal' | 'warning' | 'critical'

const DEGRADATION_THRESHOLDS = {
  reduced: 10_000,
  minimal: 50_000,
} as const

const HEAP_WARNING_MB = 900
const HEAP_CRITICAL_MB = 1200
const MAX_PINNED = 5000

export const usePerformanceStore = defineStore('performance', () => {
  const visibleElementCount = ref(0)
  const heapMb = ref(0)
  const pinnedNodeIds = ref(new Set<string>())

  const degradationLevel = computed<DegradationLevel>(() => {
    if (visibleElementCount.value >= DEGRADATION_THRESHOLDS.minimal) return 'minimal'
    if (visibleElementCount.value >= DEGRADATION_THRESHOLDS.reduced) return 'reduced'
    return 'full'
  })

  const hoverEnabled = computed(() => degradationLevel.value === 'full')
  const pickEnabled = computed(() =>
    degradationLevel.value === 'full' || degradationLevel.value === 'reduced',
  )

  const memoryPressure = computed<MemoryPressure>(() => {
    if (heapMb.value >= HEAP_CRITICAL_MB) return 'critical'
    if (heapMb.value >= HEAP_WARNING_MB) return 'warning'
    return 'normal'
  })

  function updateHeapMb(mb: number) {
    heapMb.value = mb
  }

  function pinNodes(ids: string[]) {
    const next = new Set(pinnedNodeIds.value)
    for (const id of ids) {
      if (next.size >= MAX_PINNED) break
      next.add(id)
    }
    pinnedNodeIds.value = next
  }

  function unpinNodes(ids: string[]) {
    const next = new Set(pinnedNodeIds.value)
    for (const id of ids) {
      next.delete(id)
    }
    pinnedNodeIds.value = next
  }

  function clearPins() {
    pinnedNodeIds.value = new Set()
  }

  return {
    visibleElementCount,
    heapMb,
    pinnedNodeIds,
    degradationLevel,
    hoverEnabled,
    pickEnabled,
    memoryPressure,
    updateHeapMb,
    pinNodes,
    unpinNodes,
    clearPins,
  }
})
