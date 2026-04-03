import { watch } from 'vue'
import { useViewportStore, type ViewportBounds, type TileCoord } from '@/stores/viewport'
import { useTopologyStore } from '@/stores/topology'
import { useFilterStore } from '@/stores/filter'
import { TileService } from '@/api/tile-service'

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
  const tileService = new TileService()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const loadedTiles = new Set<string>()

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

  async function loadTile(tile: TileCoord, gen: number) {
    const tileKey = `${tile.z}/${tile.x}/${tile.y}`
    const qs = filterQueryString()

    const [elemResult, linkResult] = await Promise.allSettled([
      tileService.fetchTileElements(tile.z, tile.x, tile.y, gen, qs),
      tileService.fetchTileLinks(tile.z, tile.x, tile.y, gen, qs),
    ])

    let applied = false

    if (elemResult.status === 'fulfilled' && elemResult.value) {
      topologyStore.mergeTileElements(tileKey, elemResult.value)
      applied = true
    }
    if (linkResult.status === 'fulfilled' && linkResult.value) {
      topologyStore.mergeTileLinks(tileKey, linkResult.value)
      applied = true
    }

    if (applied) {
      loadedTiles.add(tileKey)
    }
  }

  function loadVisibleTiles() {
    if (!viewportStore.bounds) return

    tileService.cancelAll()

    const tiles = viewportStore.visibleTiles
    const newTileKeys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`))

    for (const loaded of loadedTiles) {
      if (!newTileKeys.has(loaded)) {
        topologyStore.evictTile(loaded)
        loadedTiles.delete(loaded)
      }
    }

    const tilesToLoad = tiles.filter((t) => !loadedTiles.has(`${t.z}/${t.x}/${t.y}`))
    const gen = tileService.nextGeneration()
    for (const tile of tilesToLoad) {
      loadTile(tile, gen).catch(() => {})
    }
  }

  /** Force reload all tiles (e.g. when filters change) */
  function reloadAllTiles() {
    // Evict stale data from topology store before clearing loaded set
    for (const tileKey of loadedTiles) {
      topologyStore.evictTile(tileKey)
    }
    loadedTiles.clear()
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

  return { loadVisibleTiles, loadedTiles }
}
