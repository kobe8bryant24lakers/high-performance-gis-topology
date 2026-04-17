import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ViewportBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface TileCoord {
  z: number
  x: number
  y: number
}

export interface ViewportUpdate {
  zoom: number
  center: { lng: number; lat: number }
  bounds: ViewportBounds | null
}

function lngToTileX(lng: number, zoom: number): number {
  const maxLng = 180 - 1e-9
  const clampedLng = Math.max(-180, Math.min(maxLng, lng))
  return Math.floor(((clampedLng + 180) / 360) * Math.pow(2, zoom))
}

function latToTileY(lat: number, zoom: number): number {
  const clampedLat = Math.max(-85.051129, Math.min(85.051129, lat))
  const latRad = (clampedLat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  )
}

function normalizeLng(lng: number): number {
  const normalized = ((lng + 180) % 360 + 360) % 360 - 180
  return normalized === 180 ? -180 : normalized
}

export const useViewportStore = defineStore('viewport', () => {
  const zoom = ref(2)
  const center = ref({ lng: 0, lat: 0 })
  const bounds = ref<ViewportBounds | null>(null)

  function updateViewport(update: ViewportUpdate) {
    zoom.value = update.zoom
    center.value = update.center
    bounds.value = update.bounds
  }

  const visibleTiles = computed<TileCoord[]>(() => {
    if (!bounds.value) return []
    const z = Math.floor(zoom.value)
    const maxTile = Math.pow(2, z) - 1

    const yMin = Math.max(0, latToTileY(bounds.value.north, z))
    const yMax = Math.min(maxTile, latToTileY(bounds.value.south, z))
    if (yMin > yMax) return []

    const tiles: TileCoord[] = []

    const appendTileRange = (west: number, east: number) => {
      const xMin = Math.max(0, Math.min(maxTile, lngToTileX(west, z)))
      const xMax = Math.max(0, Math.min(maxTile, lngToTileX(east, z)))
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          tiles.push({ z, x, y })
        }
      }
    }

    if (bounds.value.east - bounds.value.west >= 360) {
      appendTileRange(-180, 180)
      return tiles
    }

    const west = normalizeLng(bounds.value.west)
    const east = normalizeLng(bounds.value.east)

    if (west <= east) {
      appendTileRange(west, east)
    } else {
      // Bounds crossing the antimeridian split into [west, 180) U [-180, east]
      appendTileRange(west, 180)
      appendTileRange(-180, east)
    }

    const unique = new Set<string>()
    return tiles.filter((tile) => {
      const key = `${tile.z}/${tile.x}/${tile.y}`
      if (unique.has(key)) return false
      unique.add(key)
      return true
    })
  })

  return { zoom, center, bounds, updateViewport, visibleTiles }
})
