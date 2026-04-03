<template>
  <footer class="status-bar">
    <span class="view-badge">{{ viewModeStore.isSchematic ? 'Schematic' : 'Map' }}</span>
    <span>Elements: {{ topologyStore.nodeCount }}</span>
    <span>Links: {{ topologyStore.edgeCount }}</span>
    <span v-if="topologyStore.clusterCount > 0">Clusters: {{ topologyStore.clusterCount }}</span>
    <span>Zoom: {{ viewportStore.zoom.toFixed(1) }}</span>
  </footer>
</template>

<script setup lang="ts">
import { useTopologyStore } from '@/stores/topology'
import { useViewportStore } from '@/stores/viewport'
import { useViewModeStore } from '@/stores/view-mode'

const topologyStore = useTopologyStore()
const viewportStore = useViewportStore()
const viewModeStore = useViewModeStore()
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
</style>
