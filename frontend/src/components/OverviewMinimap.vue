<template>
  <aside class="overview-minimap" data-test="overview-minimap">
    <div class="overview-title">
      <span>Regional density</span>
      <small>{{ regions.length }} city areas</small>
    </div>
    <svg
      class="overview-svg"
      data-test="overview-minimap-svg"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      role="img"
      aria-label="City-level aggregate device density overview minimap"
      @click="navigateFromPointer"
      @pointerdown="startDrag"
      @pointermove="continueDrag"
      @pointerup="stopDrag"
      @pointercancel="stopDrag"
    >
      <defs>
        <filter id="overview-heatmap-soften" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="1.6" />
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
    <div class="overview-help">Aggregate city heatmap; cursor is location only</div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RegionService } from '@/api/region-service'
import { useFilterStore } from '@/stores/filter'
import type { RegionSummary } from '@/types/topology'
import type { ViewportBounds } from '@/stores/viewport'

const WIDTH = 240
const HEIGHT = 120
const HEATMAP_COLUMNS = 48
const HEATMAP_ROWS = 24
const HEATMAP_SPREAD_PX = 11
const HEATMAP_MIN_INTENSITY = 0.035
const WORLD_BOUNDS: ViewportBounds = { west: -180, south: -85, east: 180, north: 85 }

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
  mousePosition: { lng: number; lat: number } | null
}>()

const emit = defineEmits<{
  navigate: [position: { lng: number; lat: number }]
}>()

const filterStore = useFilterStore()
const regionService = new RegionService()
const regions = ref<RegionSummary[]>([])
const isDragging = ref(false)

function project(lng: number, lat: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * WIDTH
  const y = ((85 - Math.max(-85, Math.min(85, lat))) / 170) * HEIGHT
  return { x, y }
}

function unproject(x: number, y: number): { lng: number; lat: number } {
  const lng = (Math.max(0, Math.min(WIDTH, x)) / WIDTH) * 360 - 180
  const lat = 85 - (Math.max(0, Math.min(HEIGHT, y)) / HEIGHT) * 170
  return { lng, lat }
}

const graticuleLines = computed(() => {
  const lines: { id: string; path: string }[] = []
  for (const lng of [-120, -60, 0, 60, 120]) {
    const top = project(lng, 85)
    const bottom = project(lng, -85)
    lines.push({ id: `lng-${lng}`, path: `M ${top.x} ${top.y} L ${bottom.x} ${bottom.y}` })
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    const left = project(-180, lat)
    const right = project(180, lat)
    lines.push({ id: `lat-${lat}`, path: `M ${left.x} ${left.y} L ${right.x} ${right.y}` })
  }
  return lines
})

const heatmapCells = computed<HeatmapCell[]>(() => {
  if (regions.value.length === 0) return []

  const cellWidth = WIDTH / HEATMAP_COLUMNS
  const cellHeight = HEIGHT / HEATMAP_ROWS
  const maxCount = Math.max(1, ...regions.value.map((region) => region.totalCount))
  const sources = regions.value.map((region) => ({
    point: project(region.centroidLng, region.centroidLat),
    weight: Math.log1p(region.totalCount) / Math.log1p(maxCount),
  }))
  const rawCells: Array<Omit<HeatmapCell, 'fill' | 'opacity'> & { intensity: number }> = []
  let maxIntensity = 0

  for (let row = 0; row < HEATMAP_ROWS; row += 1) {
    for (let col = 0; col < HEATMAP_COLUMNS; col += 1) {
      const x = col * cellWidth
      const y = row * cellHeight
      const centerX = x + cellWidth / 2
      const centerY = y + cellHeight / 2
      const intensity = sources.reduce((sum, source) => {
        const dx = centerX - source.point.x
        const dy = centerY - source.point.y
        const falloff = Math.exp(-(dx * dx + dy * dy) / (2 * HEATMAP_SPREAD_PX * HEATMAP_SPREAD_PX))
        return sum + source.weight * falloff
      }, 0)

      if (intensity > maxIntensity) {
        maxIntensity = intensity
      }
      rawCells.push({ id: `${row}-${col}`, x, y, width: cellWidth, height: cellHeight, intensity })
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
  const generation = regionService.nextGeneration()
  const response = await regionService.fetchRegionSummary({
    z: 8,
    bounds: WORLD_BOUNDS,
    types: filterStore.criteria.types,
    propertyFilters: filterStore.criteria.propertyFilters,
  }, generation)
  if (response) {
    regions.value = response.regions
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
  () => [filterStore.criteria.types, filterStore.criteria.propertyFilters],
  () => {
    loadDistribution().catch(() => {})
  },
  { deep: true },
)

onMounted(() => {
  loadDistribution().catch(() => {})
})

onBeforeUnmount(() => {
  regionService.cancel()
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
