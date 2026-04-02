import { watch } from 'vue'
import { useViewportStore, type ViewportBounds, type TileCoord } from '@/stores/viewport'
import { useTopologyStore } from '@/stores/topology'
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
  const tileService = new TileService()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const loadedTiles = new Set<string>()

  async function loadTile(tile: TileCoord) {
    const tileKey = `${tile.z}/${tile.x}/${tile.y}`
    const gen = tileService.nextGeneration()

    const [elemResponse, linkResponse] = await Promise.all([
      tileService.fetchTileElements(tile.z, tile.x, tile.y, gen),
      tileService.fetchTileLinks(tile.z, tile.x, tile.y, gen),
    ])

    if (elemResponse) {
      topologyStore.mergeTileElements(tileKey, elemResponse)
    }
    if (linkResponse) {
      topologyStore.mergeTileLinks(tileKey, linkResponse)
    }

    loadedTiles.add(tileKey)
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
    for (const tile of tilesToLoad) {
      loadTile(tile).catch(() => {})
    }
  }

  function onViewportChange() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(loadVisibleTiles, 200)
  }

  watch(
    () => [viewportStore.bounds, viewportStore.zoom],
    onViewportChange,
    { deep: true },
  )

  return { loadVisibleTiles, loadedTiles }
}
