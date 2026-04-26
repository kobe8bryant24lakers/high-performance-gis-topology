<template>
  <aside class="overview-minimap" data-test="overview-minimap">
    <div class="overview-title">
      <span>Overview</span>
      <small>{{ regions.length }} areas</small>
    </div>
    <svg
      class="overview-svg"
      data-test="overview-minimap-svg"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      role="img"
      aria-label="Device distribution overview minimap"
      @click="navigateFromPointer"
      @pointerdown="startDrag"
      @pointermove="continueDrag"
      @pointerup="stopDrag"
      @pointercancel="stopDrag"
    >
      <rect class="overview-bg" :width="WIDTH" :height="HEIGHT" rx="10" />
      <path
        v-for="line in graticuleLines"
        :key="line.id"
        class="overview-grid"
        :d="line.path"
      />
      <circle
        v-for="region in regions"
        :key="region.id"
        data-test="overview-density-point"
        class="overview-density-point"
        :cx="project(region.centroidLng, region.centroidLat).x"
        :cy="project(region.centroidLng, region.centroidLat).y"
        :r="densityRadius(region.totalCount)"
        :opacity="densityOpacity(region.totalCount)"
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
      </g>
    </svg>
    <div class="overview-help">Click or drag to move map</div>
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
const WORLD_BOUNDS: ViewportBounds = { west: -180, south: -85, east: 180, north: 85 }

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

function densityRadius(count: number): number {
  return Math.min(11, Math.max(2.5, Math.sqrt(count) / 4))
}

function densityOpacity(count: number): number {
  return Math.min(0.95, Math.max(0.36, Math.log10(count + 1) / 4))
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

.overview-density-point {
  fill: #22d3ee;
  stroke: rgba(236, 254, 255, 0.72);
  stroke-width: 0.8;
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
  fill: #f8fafc;
}

.overview-help {
  margin-top: 7px;
  font-size: 10px;
  color: #94a3b8;
}
</style>
