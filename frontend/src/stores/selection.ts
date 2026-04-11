import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { usePerformanceStore } from '@/stores/performance'
import { useTopologyStore } from '@/stores/topology'

const MAX_SELECTION = 500

export const useSelectionStore = defineStore('selection', () => {
  const selectedIds = ref(new Set<string>())
  const primarySelectedId = ref<string | null>(null)

  function selectElement(id: string) {
    selectedIds.value = new Set([id])
    primarySelectedId.value = id
  }

  function toggleElement(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) {
      next.delete(id)
      if (primarySelectedId.value === id) {
        primarySelectedId.value = next.size > 0 ? ([...next].pop() ?? null) : null
      }
    } else {
      if (next.size >= MAX_SELECTION) return
      next.add(id)
      primarySelectedId.value = id
    }
    selectedIds.value = next
  }

  function selectMany(ids: string[]) {
    const next = new Set(ids.slice(0, MAX_SELECTION))
    selectedIds.value = next
    primarySelectedId.value = next.size > 0 ? (ids[0] ?? null) : null
  }

  function clearSelection() {
    selectedIds.value = new Set()
    primarySelectedId.value = null
  }

  const hasSelection = computed(() => selectedIds.value.size > 0)

  // Track which IDs this store has pinned, so we only unpin our own
  let selectionOwnedPins = new Set<string>()

  // Sync selection to performance store pinned nodes and prune deferred evictions
  watch(selectedIds, (ids) => {
    const performanceStore = usePerformanceStore()
    const topologyStore = useTopologyStore()

    // Unpin only IDs that selection previously owned
    const toUnpin = [...selectionOwnedPins].filter((id) => !ids.has(id))
    if (toUnpin.length > 0) {
      performanceStore.unpinNodes(toUnpin)
    }

    // Pin newly selected IDs
    const toPin = [...ids].filter((id) => !selectionOwnedPins.has(id))
    if (toPin.length > 0) {
      performanceStore.pinNodes(toPin)
    }

    selectionOwnedPins = new Set(ids)

    // Prune zero-ref nodes that were deferred while previously pinned
    topologyStore.pruneUnpinnedNodes(performanceStore.pinnedNodeIds)
  })

  return {
    selectedIds, primarySelectedId, hasSelection,
    selectElement, toggleElement, selectMany, clearSelection,
  }
})
