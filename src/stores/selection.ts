import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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

  return {
    selectedIds, primarySelectedId, hasSelection,
    selectElement, toggleElement, selectMany, clearSelection,
  }
})
