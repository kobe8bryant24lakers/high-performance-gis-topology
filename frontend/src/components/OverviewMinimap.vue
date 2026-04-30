<template>
  <aside class="overview-minimap" data-test="overview-minimap">
    <div class="overview-title">
      <span>Nearby density</span>
      <small>{{ compactNumber(heatmapMeta.totalCount) }} devices</small>
    </div>
    <svg
      class="overview-svg"
      data-test="overview-minimap-svg"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      role="img"
      aria-label="Real device density overview minimap"
      @click="navigateFromPointer"
      @pointerdown="startDrag"
      @pointermove="continueDrag"
      @pointerup="stopDrag"
      @pointercancel="stopDrag"
    >
      <defs>
        <filter id="overview-heatmap-soften" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
      </defs>
      <rect class="overview-bg" :width="WIDTH" :height="HEIGHT" rx="10" />
      <g class="overview-heatmap" filter="url(#overview-heatmap-soften)">
        <rect
          v-for="cell in heatmapCells"
          :key="cell.id"
          data-test="overview-heatmap-cell"
          class="overview-heatmap-cell"
          :x="cell.x"
          :y="cell.y"
          :width="cell.width"
          :height="cell.height"
          :fill="cell.fill"
          :opacity="cell.opacity"
        />
      </g>
      <path
        v-for="line in graticuleLines"
        :key="line.id"
        class="overview-grid"
        :d="line.path"
      />
      <rect
        v-if="viewportRect"
        data-test="overview-viewport"
        class="overview-viewport"
        :x="viewportRect.x"
        :y="viewportRect.y"
        :width="viewportRect.width"
        :height="viewportRect.height"
      />
      <g v-if="mousePoint" data-test="overview-mouse" class="overview-mouse">
        <line :x1="mousePoint.x - 5" :x2="mousePoint.x + 5" :y1="mousePoint.y" :y2="mousePoint.y" />
        <line :x1="mousePoint.x" :x2="mousePoint.x" :y1="mousePoint.y - 5" :y2="mousePoint.y + 5" />
        <circle :cx="mousePoint.x" :cy="mousePoint.y" r="2.5" />
        <text :x="Math.min(WIDTH - 27, mousePoint.x + 7)" :y="Math.max(9, mousePoint.y - 4)">cursor</text>
      </g>
    </svg>
    <div class="overview-help">Visible policy heatmap; cursor is location only</div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { HeatmapService } from '@/api/heatmap-service'
import { useFilterStore } from '@/stores/filter'
import type { DeviceHeatmapCell } from '@/types/topology'
import type { ViewportBounds } from '@/stores/viewport'

const WIDTH = 240
const HEIGHT = 120
const HEATMAP_COLUMNS = 48
const HEATMAP_ROWS = 24
const HEATMAP_MIN_INTENSITY = 0.06
const WORLD_BOUNDS: ViewportBounds = { west: -180, south: -85, east: 180, north: 85 }
const HEATMAP_KERNEL = [
  { dx: 0, dy: 0, weight: 1 },
  { dx: -1, dy: 0, weight: 0.38 },
  { dx: 1, dy: 0, weight: 0.38 },
  { dx: 0, dy: -1, weight: 0.38 },
  { dx: 0, dy: 1, weight: 0.38 },
  { dx: -1, dy: -1, weight: 0.18 },
  { dx: 1, dy: -1, weight: 0.18 },
  { dx: -1, dy: 1, weight: 0.18 },
  { dx: 1, dy: 1, weight: 0.18 },
]

type HeatmapCell = {
  id: string
  x: number
  y: number
  width: number
  height: number
  fill: string
  opacity: number
}

const props = defineProps<{
  bounds: ViewportBounds | null
  zoom: number
  mousePosition: { lng: number; lat: number } | null
}>()

const emit = defineEmits<{
  navigate: [position: { lng: number; lat: number }]
}>()

const filterStore = useFilterStore()
const heatmapService = new HeatmapService()
const deviceHeatmapCells = ref<DeviceHeatmapCell[]>([])
const heatmapMeta = ref({
  west: WORLD_BOUNDS.west,
  south: WORLD_BOUNDS.south,
  east: WORLD_BOUNDS.east,
  north: WORLD_BOUNDS.north,
  columns: HEATMAP_COLUMNS,
  rows: HEATMAP_ROWS,
  maxCount: 0,
  totalCount: 0,
})
const isDragging = ref(false)

function project(lng: number, lat: number): { x: number; y: number } {
  const bounds = heatmapMeta.value
  const lngSpan = Math.max(1e-9, bounds.east - bounds.west)
  const latSpan = Math.max(1e-9, bounds.north - bounds.south)
  const clampedLng = Math.max(bounds.west, Math.min(bounds.east, lng))
  const clampedLat = Math.max(bounds.south, Math.min(bounds.north, lat))
  const x = ((clampedLng - bounds.west) / lngSpan) * WIDTH
  const y = ((bounds.north - clampedLat) / latSpan) * HEIGHT
  return { x, y }
}

function unproject(x: number, y: number): { lng: number; lat: number } {
  const bounds = heatmapMeta.value
  const lng = bounds.west + (Math.max(0, Math.min(WIDTH, x)) / WIDTH) * (bounds.east - bounds.west)
  const lat = bounds.north - (Math.max(0, Math.min(HEIGHT, y)) / HEIGHT) * (bounds.north - bounds.south)
  return { lng, lat }
}

const graticuleLines = computed(() => {
  const lines: { id: string; path: string }[] = []
  const bounds = heatmapMeta.value
  for (let i = 1; i <= 4; i += 1) {
    const lng = bounds.west + ((bounds.east - bounds.west) * i) / 5
    const top = project(lng, bounds.north)
    const bottom = project(lng, bounds.south)
    lines.push({ id: `lng-${i}`, path: `M ${top.x} ${top.y} L ${bottom.x} ${bottom.y}` })
  }
  for (let i = 1; i <= 3; i += 1) {
    const lat = bounds.south + ((bounds.north - bounds.south) * i) / 4
    const left = project(bounds.west, lat)
    const right = project(bounds.east, lat)
    lines.push({ id: `lat-${i}`, path: `M ${left.x} ${left.y} L ${right.x} ${right.y}` })
  }
  return lines
})

const heatmapCells = computed<HeatmapCell[]>(() => {
  if (deviceHeatmapCells.value.length === 0 || heatmapMeta.value.maxCount <= 0) return []

  const columns = Math.max(1, heatmapMeta.value.columns)
  const rows = Math.max(1, heatmapMeta.value.rows)
  const cellWidth = WIDTH / columns
  const cellHeight = HEIGHT / rows
  const maxCount = Math.max(1, heatmapMeta.value.maxCount)
  const baseGrid = new Float32Array(columns * rows)

  for (const cell of deviceHeatmapCells.value) {
    if (cell.x < 0 || cell.x >= columns || cell.y < 0 || cell.y >= rows) continue
    const index = cell.y * columns + cell.x
    baseGrid[index] = Math.max(
      baseGrid[index] ?? 0,
      Math.log1p(cell.count) / Math.log1p(maxCount),
    )
  }

  const rawCells: Array<Omit<HeatmapCell, 'fill' | 'opacity'> & { intensity: number }> = []
  let maxIntensity = 0
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      let intensity = 0
      for (const kernel of HEATMAP_KERNEL) {
        const sourceX = x + kernel.dx
        const sourceY = y + kernel.dy
        if (sourceX < 0 || sourceX >= columns || sourceY < 0 || sourceY >= rows) continue
        intensity += (baseGrid[sourceY * columns + sourceX] ?? 0) * kernel.weight
      }
      if (intensity > 0) {
        maxIntensity = Math.max(maxIntensity, intensity)
        rawCells.push({
          id: `${y}-${x}`,
          x: x * cellWidth,
          y: y * cellHeight,
          width: cellWidth + 0.35,
          height: cellHeight + 0.35,
          intensity,
        })
      }
    }
  }

  if (maxIntensity <= 0) return []

  return rawCells
    .map((cell) => ({ ...cell, intensity: cell.intensity / maxIntensity }))
    .filter((cell) => cell.intensity >= HEATMAP_MIN_INTENSITY)
    .map((cell) => ({
      id: cell.id,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      fill: heatmapFill(cell.intensity),
      opacity: heatmapOpacity(cell.intensity),
    }))
})

function heatmapFill(intensity: number): string {
  if (intensity >= 0.78) return '#fb923c'
  if (intensity >= 0.55) return '#facc15'
  if (intensity >= 0.32) return '#22d3ee'
  return '#0ea5e9'
}

function heatmapOpacity(intensity: number): number {
  return Math.min(0.92, Math.max(0.14, intensity * 0.82))
}

function heatmapBufferRatio(zoom: number): number {
  const z = Math.floor(zoom)
  if (z <= 6) return 1
  if (z <= 10) return 0.5
  return 0.25
}

function heatmapBoundsForViewport(bounds: ViewportBounds | null, zoom: number): ViewportBounds {
  if (!bounds) return WORLD_BOUNDS
  const ratio = heatmapBufferRatio(zoom)
  const lngPadding = Math.max(0.05, (bounds.east - bounds.west) * ratio)
  const latPadding = Math.max(0.05, (bounds.north - bounds.south) * ratio)
  return {
    west: Math.max(-180, bounds.west - lngPadding),
    south: Math.max(-85, bounds.south - latPadding),
    east: Math.min(180, bounds.east + lngPadding),
    north: Math.min(85, bounds.north + latPadding),
  }
}

function compactNumber(value: number): string {
  if (value < 1000) return `${value}`
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

const viewportRect = computed(() => {
  if (!props.bounds) return null
  const westNorth = project(props.bounds.west, props.bounds.north)
  const eastSouth = project(props.bounds.east, props.bounds.south)
  const x = Math.min(westNorth.x, eastSouth.x)
  const y = Math.min(westNorth.y, eastSouth.y)
  return {
    x,
    y,
    width: Math.max(2, Math.abs(eastSouth.x - westNorth.x)),
    height: Math.max(2, Math.abs(eastSouth.y - westNorth.y)),
  }
})

const mousePoint = computed(() =>
  props.mousePosition ? project(props.mousePosition.lng, props.mousePosition.lat) : null,
)

async function loadDistribution() {
  const generation = heatmapService.nextGeneration()
  const bounds = heatmapBoundsForViewport(props.bounds, props.zoom)
  const response = await heatmapService.fetchDeviceHeatmap({
    bounds,
    columns: HEATMAP_COLUMNS,
    rows: HEATMAP_ROWS,
    zoom: props.zoom,
    types: filterStore.criteria.types,
    propertyFilters: filterStore.criteria.propertyFilters,
  }, generation)
  if (response) {
    deviceHeatmapCells.value = response.cells
    heatmapMeta.value = {
      west: response.west,
      south: response.south,
      east: response.east,
      north: response.north,
      columns: response.columns,
      rows: response.rows,
      maxCount: response.maxCount,
      totalCount: response.totalCount,
    }
  }
}

function pointerToPosition(event: MouseEvent | PointerEvent): { lng: number; lat: number } {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const width = rect.width || WIDTH
  const height = rect.height || HEIGHT
  const x = ((event.clientX - rect.left) / width) * WIDTH
  const y = ((event.clientY - rect.top) / height) * HEIGHT
  return unproject(x, y)
}

function navigateFromPointer(event: MouseEvent) {
  emit('navigate', pointerToPosition(event))
}

function startDrag(event: PointerEvent) {
  ;(event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId)
  isDragging.value = true
}

function continueDrag(event: PointerEvent) {
  if (!isDragging.value) return
  emit('navigate', pointerToPosition(event))
}

function stopDrag() {
  isDragging.value = false
}

watch(
  () => [props.bounds, props.zoom, filterStore.criteria.types, filterStore.criteria.propertyFilters],
  () => {
    loadDistribution().catch(() => {})
  },
  { deep: true },
)

onMounted(() => {
  loadDistribution().catch(() => {})
})

onBeforeUnmount(() => {
  heatmapService.cancel()
})
</script>

<style scoped>
.overview-minimap {
  position: absolute;
  right: 16px;
  bottom: 44px;
  z-index: 6;
  width: 260px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.88);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.38);
  color: #cbd5e1;
  pointer-events: auto;
  user-select: none;
}

.overview-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 7px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #f8fafc;
}

.overview-title small {
  font-size: 10px;
  font-weight: 500;
  color: #94a3b8;
}

.overview-svg {
  display: block;
  width: 240px;
  height: 120px;
  cursor: crosshair;
}

.overview-bg {
  fill: #020617;
  stroke: rgba(125, 211, 252, 0.2);
}

.overview-grid {
  stroke: rgba(148, 163, 184, 0.14);
  stroke-width: 0.7;
  fill: none;
}

.overview-heatmap {
  pointer-events: none;
}

.overview-heatmap-cell {
  stroke: none;
}

.overview-viewport {
  fill: rgba(251, 191, 36, 0.12);
  stroke: #fbbf24;
  stroke-width: 1.5;
}

.overview-mouse line,
.overview-mouse circle {
  stroke: #f8fafc;
  stroke-width: 1.2;
  fill: none;
}

.overview-mouse text {
  fill: #e2e8f0;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.02em;
  paint-order: stroke;
  stroke: rgba(15, 23, 42, 0.85);
  stroke-width: 2.5;
}

.overview-help {
  margin-top: 7px;
  font-size: 10px;
  color: #94a3b8;
}
</style>
