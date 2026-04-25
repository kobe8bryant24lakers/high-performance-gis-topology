import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RegionLevel, RegionSummary, RegionSummaryResponse, RegionVirtualLink } from '@/types/topology'

export const useRegionStore = defineStore('regions', () => {
  const level = ref<RegionLevel | null>(null)
  const regions = ref(new Map<string, RegionSummary>())
  const links = ref<RegionVirtualLink[]>([])
  const generation = ref(0)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const regionsList = computed(() => [...regions.value.values()])
  const linkCount = computed(() => links.value.length)

  function replaceSummary(response: RegionSummaryResponse) {
    level.value = response.level
    regions.value = new Map(response.regions.map((region) => [region.id, region]))
    links.value = response.links
    generation.value = response.generation
    error.value = null
  }

  function clear() {
    level.value = null
    regions.value.clear()
    links.value = []
    generation.value = 0
    isLoading.value = false
    error.value = null
  }

  return {
    level,
    regions,
    links,
    generation,
    isLoading,
    error,
    regionsList,
    linkCount,
    replaceSummary,
    clear,
  }
})
