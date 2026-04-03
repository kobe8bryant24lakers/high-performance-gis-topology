import { watch } from 'vue'
import { useViewportStore, type ViewportBounds, type TileCoord } from '@/stores/viewport'
import { useTopologyStore } from '@/stores/topology'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { TileService } from '@/api/tile-service'
import { LruTileCache } from '@/utils/lru-tile-cache'
import { telemetry } from '@/utils/telemetry'

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
}

function latToTileY(lat: number, zoom: number): number {
  const clampedLat = Math.max(-85.051129, Math.min(85.051129, lat))
  const latRad = (clampedLat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  )
}

export function bboxToTiles(bounds: ViewportBounds, zoom: number): TileCoord[] {
  const z = Math.floor(zoom)
  const maxTile = Math.pow(2, z) - 1

  const xMin = Math.max(0, lngToTileX(bounds.west, z))
  const xMax = Math.min(maxTile, lngToTileX(bounds.east, z))
  const yMin = Math.max(0, latToTileY(bounds.north, z))
  const yMax = Math.min(maxTile, latToTileY(bounds.south, z))

  const tiles: TileCoord[] = []
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z, x, y })
    }
  }
  return tiles
}

export function useTileLoader() {
  const viewportStore = useViewportStore()
  const topologyStore = useTopologyStore()
  const filterStore = useFilterStore()
  const performanceStore = usePerformanceStore()
  const tileService = new TileService()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const tileCache = new LruTileCache(200, 200_000)

  /** Build filter query string for tile fetch URLs */
  function filterQueryString(): string {
    const params: string[] = []
    if (filterStore.criteria.types.length > 0) {
      params.push(`types=${filterStore.criteria.types.join(',')}`)
    }
    for (const [key, value] of Object.entries(filterStore.criteria.propertyFilters)) {
      params.push(`prop.${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    }
    return params.length > 0 ? `?${params.join('&')}` : ''
  }

  function evictTiles(tileKeys: string[]) {
    for (const key of tileKeys) {
      topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
    }
  }

  async function loadTile(tile: TileCoord, gen: number) {
    const tileKey = `${tile.z}/${tile.x}/${tile.y}`
    const qs = filterQueryString()
    const start = performance.now()

    const [elemResult, linkResult] = await Promise.allSettled([
      tileService.fetchTileElements(tile.z, tile.x, tile.y, gen, qs),
      tileService.fetchTileLinks(tile.z, tile.x, tile.y, gen, qs),
    ])

    telemetry.emit('tile_fetch_ms', performance.now() - start)

    let elementCount = 0
    let applied = false

    if (elemResult.status === 'fulfilled' && elemResult.value) {
      topologyStore.mergeTileElements(tileKey, elemResult.value)
      elementCount = elemResult.value.elements.length + elemResult.value.clusters.length
      applied = true
    }
    if (linkResult.status === 'fulfilled' && linkResult.value) {
      topologyStore.mergeTileLinks(tileKey, linkResult.value)
      applied = true
    }

    if (applied) {
      const evicted = tileCache.touch(tileKey, elementCount)
      evictTiles(evicted)
    }

    // Update visible element count for degradation
    performanceStore.visibleElementCount = topologyStore.nodeCount
  }

  function loadVisibleTiles() {
    if (!viewportStore.bounds) return

    tileService.cancelAll()

    const tiles = viewportStore.visibleTiles
    const newTileKeys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`))

    // Evict tiles no longer in the viewport
    for (const key of [...tileCache.keys()]) {
      if (!newTileKeys.has(key)) {
        topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
        tileCache.delete(key)
      }
    }

    const tilesToLoad = tiles.filter((t) => !tileCache.has(`${t.z}/${t.x}/${t.y}`))
    const gen = tileService.nextGeneration()
    for (const tile of tilesToLoad) {
      loadTile(tile, gen).catch(() => {})
    }

    // Update visible element count
    performanceStore.visibleElementCount = topologyStore.nodeCount
  }

  /** Force reload all tiles (e.g. when filters change) */
  function reloadAllTiles() {
    // Evict stale data from topology store before clearing cache
    for (const key of [...tileCache.keys()]) {
      topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
      tileCache.delete(key)
    }
    loadVisibleTiles()
  }

  function onViewportChange() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(loadVisibleTiles, 200)
  }

  // Watch viewport changes
  watch(
    () => [viewportStore.bounds, viewportStore.zoom],
    onViewportChange,
    { deep: true },
  )

  // Watch filter changes — reload tiles when filters change
  watch(
    () => [filterStore.criteria.types, filterStore.criteria.propertyFilters],
    () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(reloadAllTiles, 200)
    },
    { deep: true },
  )

  // Memory pressure: aggressive eviction under pressure
  watch(
    () => performanceStore.memoryPressure,
    (pressure) => {
      if (pressure === 'critical') {
        // Keep only tiles in the current viewport
        const currentKeys = new Set(
          viewportStore.visibleTiles.map((t) => `${t.z}/${t.x}/${t.y}`),
        )
        for (const key of [...tileCache.keys()]) {
          if (!currentKeys.has(key)) {
            topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
            tileCache.delete(key)
          }
        }
      }
    },
  )

  // Poll heap usage (Chrome-only, best-effort)
  let heapInterval: ReturnType<typeof setInterval> | null = null
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    heapInterval = setInterval(() => {
      const mem = (performance as any).memory
      if (mem?.usedJSHeapSize) {
        const mb = mem.usedJSHeapSize / (1024 * 1024)
        performanceStore.updateHeapMb(mb)
        telemetry.emit('heap_mb', mb)
      }
    }, 5000)
  }

  function dispose() {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (heapInterval) clearInterval(heapInterval)
  }

  return { loadVisibleTiles, tileCache, dispose }
}
