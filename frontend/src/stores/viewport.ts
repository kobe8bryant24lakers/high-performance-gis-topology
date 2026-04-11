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
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  )
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

    const xMin = Math.max(0, lngToTileX(bounds.value.west, z))
    const xMax = Math.min(maxTile, lngToTileX(bounds.value.east, z))
    const yMin = Math.max(0, latToTileY(bounds.value.north, z))
    const yMax = Math.min(maxTile, latToTileY(bounds.value.south, z))

    const tiles: TileCoord[] = []
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y })
      }
    }
    return tiles
  })

  return { zoom, center, bounds, updateViewport, visibleTiles }
})
