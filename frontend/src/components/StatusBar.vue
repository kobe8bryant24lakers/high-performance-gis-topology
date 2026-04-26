<template>
  <footer class="status-bar">
    <span class="view-badge">Map</span>
    <template v-if="showRegionStatus">
      <template v-if="regionStore.regionsList.length > 0">
        <span>Regions: {{ regionStore.regionsList.length }}</span>
        <span>Regional devices: {{ compactNumber(regionalDeviceCount) }}</span>
        <span v-if="regionStore.linkCount > 0">Region links: {{ regionStore.linkCount }}</span>
      </template>
      <span v-else>Regions: loading</span>
    </template>
    <template v-else>
      <span>Elements: {{ topologyStore.nodeCount }}</span>
      <span>Links: {{ topologyStore.edgeCount }}</span>
    </template>
    <span v-if="topologyStore.clusterCount > 0">Clusters: {{ topologyStore.clusterCount }}</span>
    <span>Zoom: {{ viewportStore.zoom.toFixed(1) }}</span>
    <span v-if="performanceStore.degradationLevel !== 'full'" class="degradation-badge" :class="performanceStore.degradationLevel">
      {{ degradationLabel }}
    </span>
    <span v-if="performanceStore.memoryPressure !== 'normal'" class="memory-badge" :class="performanceStore.memoryPressure">
      {{ performanceStore.memoryPressure === 'critical' ? 'Memory Critical' : 'Memory Warning' }}
    </span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useViewportStore } from '@/stores/viewport'
import { usePerformanceStore } from '@/stores/performance'
import { useRegionStore } from '@/stores/regions'

const topologyStore = useTopologyStore()
const viewportStore = useViewportStore()
const performanceStore = usePerformanceStore()
const regionStore = useRegionStore()

const isRegionZoom = computed(() => Math.floor(viewportStore.zoom) <= 9)
const showRegionStatus = computed(() =>
  isRegionZoom.value || (regionStore.regionsList.length > 0 && topologyStore.nodeCount === 0),
)

const regionalDeviceCount = computed(() =>
  regionStore.regionsList.reduce((total, region) => total + region.totalCount, 0),
)

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return `${value}`
}

const degradationLabel = computed(() => {
  switch (performanceStore.degradationLevel) {
    case 'reduced': return 'Reduced Interaction'
    case 'minimal': return 'Minimal Interaction'
    default: return ''
  }
})
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 28px;
  padding: 0 16px;
  background: #181825;
  color: #a6adc8;
  font-size: 12px;
  border-top: 1px solid #313244;
  z-index: 20;
}

.view-badge {
  padding: 1px 8px;
  background: #313244;
  border-radius: 3px;
  font-size: 11px;
  color: #89b4fa;
}

.degradation-badge {
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 11px;
}

.degradation-badge.reduced {
  background: #45475a;
  color: #f9e2af;
}

.degradation-badge.minimal {
  background: #45475a;
  color: #fab387;
}

.memory-badge {
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 11px;
}

.memory-badge.warning {
  background: #45475a;
  color: #f9e2af;
}

.memory-badge.critical {
  background: #f38ba8;
  color: #1e1e2e;
}
</style>
