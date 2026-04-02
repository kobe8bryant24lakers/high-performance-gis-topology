<template>
  <footer class="status-bar">
    <span>Elements: {{ topologyStore.nodeCount }}</span>
    <span>Links: {{ topologyStore.edgeCount }}</span>
    <span>Zoom: {{ viewportStore.zoom.toFixed(1) }}</span>
  </footer>
</template>

<script setup lang="ts">
import { useTopologyStore } from '@/stores/topology'
import { useViewportStore } from '@/stores/viewport'

const topologyStore = useTopologyStore()
const viewportStore = useViewportStore()
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
</style>
