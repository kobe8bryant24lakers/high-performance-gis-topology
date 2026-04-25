<template>
  <div ref="containerRef" class="map-view">
    <div ref="mapRef" class="map-container" />
    <canvas ref="deckRef" class="deck-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Deck } from '@deck.gl/core'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { useViewportStore } from '@/stores/viewport'
import { useSelectionStore } from '@/stores/selection'
import { useTileLoader } from '@/composables/use-tile-loader'
import { useRegionLoader } from '@/composables/use-region-loader'
import { useDeckLayers } from '@/composables/use-deck-layers'

const emit = defineEmits<{
  elementClick: [id: string]
  elementHover: [id: string | null]
}>()

const containerRef = ref<HTMLElement | null>(null)
const mapRef = ref<HTMLElement | null>(null)

const viewportStore = useViewportStore()
const selectionStore = useSelectionStore()

let map: mapboxgl.Map | null = null
let overlay: MapboxOverlay | null = null

const hoveredId = ref<string | null>(null)

function handleClick(id: string, event?: PointerEvent) {
  if (event?.ctrlKey || event?.metaKey) {
    selectionStore.toggleElement(id)
  } else {
    selectionStore.selectElement(id)
  }
  emit('elementClick', id)
}

function handleHover(id: string | null) {
  hoveredId.value = id
  emit('elementHover', id)
}

const { layers } = useDeckLayers(handleClick, handleHover)
const { loadVisibleTiles } = useTileLoader()
const { loadRegionSummaries, dispose: disposeRegionLoader } = useRegionLoader()

function syncViewport() {
  if (!map) return
  const bounds = map.getBounds()
  if (!bounds) return
  const center = map.getCenter()
  viewportStore.updateViewport({
    zoom: map.getZoom(),
    center: { lng: center.lng, lat: center.lat },
    bounds: {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    },
  })
}

/** Fly to a specific lng/lat position with animation */
function flyTo(lng: number, lat: number, zoom?: number) {
  map?.flyTo({
    center: [lng, lat],
    zoom: zoom ?? Math.max(map?.getZoom() ?? 12, 12),
    duration: 1500,
  })
}

// Expose flyTo for parent components
defineExpose({ flyTo })

onMounted(() => {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) {
    console.error('VITE_MAPBOX_TOKEN is not set. Add it to .env')
    return
  }
  mapboxgl.accessToken = token

  // Initialize map from viewport store state (preserves context across view toggles)
  map = new mapboxgl.Map({
    container: mapRef.value!,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [viewportStore.center.lng, viewportStore.center.lat],
    zoom: viewportStore.zoom,
    projection: 'mercator',
    pitch: 0,
    bearing: 0,
  })

  overlay = new MapboxOverlay({
    interleaved: false,
    layers: layers.value,
  })

  map.addControl(overlay as unknown as mapboxgl.IControl)
  map.addControl(new mapboxgl.NavigationControl(), 'top-right')

  map.on('moveend', syncViewport)
  map.on('load', () => {
    syncViewport()
    loadRegionSummaries()
    loadVisibleTiles()
  })

  watch(layers, (newLayers) => {
    overlay?.setProps({ layers: newLayers })
  })
})

onUnmounted(() => {
  disposeRegionLoader()
  map?.remove()
  map = null
  overlay = null
})
</script>

<style scoped>
.map-view {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  position: absolute;
  inset: 0;
}

.deck-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
