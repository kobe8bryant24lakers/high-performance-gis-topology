import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePerformanceStore } from '@/stores/performance'

const MAX_BREADCRUMBS = 50
const MAX_EXPANDED_NODES = 2_000

export interface BreadcrumbEntry {
  id: string
  label: string
}

export const useExplorationStore = defineStore('exploration', () => {
  const breadcrumbs = ref<BreadcrumbEntry[]>([])
  const expandedNodeIds = ref(new Set<string>())
  const isExpanding = ref(false)

  const canExpand = computed(() => expandedNodeIds.value.size < MAX_EXPANDED_NODES)

  function pushBreadcrumb(entry: BreadcrumbEntry) {
    const last = breadcrumbs.value[breadcrumbs.value.length - 1]
    if (last?.id === entry.id) return

    breadcrumbs.value.push(entry)
    while (breadcrumbs.value.length > MAX_BREADCRUMBS) {
      breadcrumbs.value.shift()
    }
  }

  function navigateTo(index: number) {
    if (index < 0 || index >= breadcrumbs.value.length) return
    breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  }

  function addExpandedNodes(ids: string[]) {
    const next = new Set(expandedNodeIds.value)
    for (const id of ids) {
      if (next.size >= MAX_EXPANDED_NODES) break
      next.add(id)
    }
    expandedNodeIds.value = next
  }

  function setExpanding(value: boolean) {
    isExpanding.value = value
  }

  function clearExploration() {
    // Unpin exploration-pinned nodes before clearing tracking
    if (expandedNodeIds.value.size > 0) {
      const performanceStore = usePerformanceStore()
      performanceStore.unpinNodes([...expandedNodeIds.value])
    }
    breadcrumbs.value = []
    expandedNodeIds.value = new Set()
    isExpanding.value = false
  }

  return {
    breadcrumbs,
    expandedNodeIds,
    isExpanding,
    canExpand,
    pushBreadcrumb,
    navigateTo,
    addExpandedNodes,
    setExpanding,
    clearExploration,
  }
})
