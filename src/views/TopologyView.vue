<template>
  <div class="topology-view">
    <TopToolbar />
    <div class="main-area">
      <SidePanel />
      <MapView
        @element-click="onElementClick"
        @element-hover="onElementHover"
      />
    </div>
    <StatusBar />
  </div>
</template>

<script setup lang="ts">
import TopToolbar from '@/components/TopToolbar.vue'
import MapView from '@/components/MapView.vue'
import SidePanel from '@/components/SidePanel.vue'
import StatusBar from '@/components/StatusBar.vue'

function onElementClick(id: string) {
  // Selection is handled inside MapView via the selection store
}

function onElementHover(id: string | null) {
  // Future: tooltip rendering
}
</script>

<style scoped>
.topology-view {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #1e1e2e;
}

.main-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>
