import { onScopeDispose, watch } from 'vue'
import { RegionService } from '@/api/region-service'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { useRegionStore } from '@/stores/regions'
import { useViewportStore } from '@/stores/viewport'
import { telemetry } from '@/utils/telemetry'

export function shouldUseRegionSummaries(
  zoom: number,
  visibleElementCount: number = Number.POSITIVE_INFINITY,
): boolean {
  const z = Math.floor(zoom)
  return z <= 11 || (z >= 12 && visibleElementCount === 0)
}

export function regionSummaryQueryZoom(zoom: number): number {
  return Math.min(Math.floor(zoom), 9)
}

export function useRegionLoader() {
  const viewportStore = useViewportStore()
  const filterStore = useFilterStore()
  const performanceStore = usePerformanceStore()
  const regionStore = useRegionStore()
  const regionService = new RegionService()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function loadRegionSummaries() {
    if (!viewportStore.bounds || !shouldUseRegionSummaries(viewportStore.zoom, performanceStore.visibleElementCount)) {
      regionStore.clear()
      return
    }

    const generation = regionService.nextGeneration()
    regionStore.isLoading = true
    regionStore.error = null
    const start = performance.now()

    try {
      const response = await regionService.fetchRegionSummary({
        z: regionSummaryQueryZoom(viewportStore.zoom),
        bounds: viewportStore.bounds,
        types: filterStore.criteria.types,
        propertyFilters: filterStore.criteria.propertyFilters,
      }, generation)
      if (response) {
        regionStore.replaceSummary(response)
      }
      telemetry.emit('tile_fetch_ms', performance.now() - start)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'AbortError') return
      regionStore.error = 'Failed to load region summaries'
    } finally {
      if (generation === regionService.currentGeneration()) {
        regionStore.isLoading = false
      }
    }
  }

  function onViewportOrFilterChange() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      loadRegionSummaries().catch(() => {})
    }, 200)
  }

  watch(
    () => [viewportStore.bounds, viewportStore.zoom, performanceStore.visibleElementCount],
    onViewportOrFilterChange,
    { deep: true },
  )

  watch(
    () => [filterStore.criteria.types, filterStore.criteria.propertyFilters],
    onViewportOrFilterChange,
    { deep: true },
  )

  function dispose() {
    if (debounceTimer) clearTimeout(debounceTimer)
    regionService.cancel()
  }

  onScopeDispose(dispose)

  return { loadRegionSummaries, dispose }
}
