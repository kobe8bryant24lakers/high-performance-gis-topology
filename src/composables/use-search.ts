import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { apiGet } from '@/api/client'
import { useFilterStore } from '@/stores/filter'
import { telemetry } from '@/utils/telemetry'
import type { NetworkElement, SearchResponse } from '@/types/topology'

export async function performSearch(
  query: string,
  limit: number = 20,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  if (!query.trim()) return { results: [], total: 0 }
  return apiGet<SearchResponse>(
    `/api/topology/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { signal },
  )
}

/** Singleton search store — avoids duplicate watchers/API calls across components */
export const useSearchStore = defineStore('search', () => {
  const filterStore = useFilterStore()

  const results = ref<NetworkElement[]>([])
  const total = ref(0)
  const isSearching = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null

  async function search(query: string) {
    abortController?.abort()
    abortController = new AbortController()

    if (!query.trim()) {
      results.value = []
      total.value = 0
      isSearching.value = false
      return
    }

    isSearching.value = true
    const start = performance.now()
    try {
      const response = await performSearch(query, 20, abortController.signal)
      results.value = response.results
      total.value = response.total
      telemetry.emit('search_ms', performance.now() - start)
    } catch {
      // Aborted or failed — ignore
    } finally {
      isSearching.value = false
    }
  }

  watch(
    () => filterStore.criteria.searchQuery,
    (query) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => search(query), 300)
    },
  )

  function clearResults() {
    results.value = []
    total.value = 0
  }

  return { results, total, isSearching, search, clearResults }
})

/** Convenience wrapper for backward compatibility */
export function useSearch() {
  return useSearchStore()
}
