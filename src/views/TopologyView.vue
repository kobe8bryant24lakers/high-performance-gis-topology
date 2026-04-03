<template>
  <div class="topology-view">
    <TopToolbar @fly-to="onFlyTo" />
    <div class="main-area">
      <SidePanel @fly-to="onFlyTo" />
      <MapView
        v-show="!viewModeStore.isSchematic"
        ref="mapViewRef"
        @element-click="onElementClick"
        @element-hover="onElementHover"
      />
      <SchematicView
        v-show="viewModeStore.isSchematic"
        @element-click="onElementClick"
        @element-hover="onElementHover"
      />
    </div>
    <StatusBar />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TopToolbar from '@/components/TopToolbar.vue'
import MapView from '@/components/MapView.vue'
import SchematicView from '@/components/SchematicView.vue'
import SidePanel from '@/components/SidePanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import { useViewModeStore } from '@/stores/view-mode'
import type { NetworkElement } from '@/types/topology'

const viewModeStore = useViewModeStore()
const mapViewRef = ref<InstanceType<typeof MapView> | null>(null)

function onElementClick(id: string) {
  // Selection is handled inside views via the selection store
}

function onElementHover(id: string | null) {
  // Future: tooltip rendering
}

function onFlyTo(element: NetworkElement) {
  // Switch to map view if in schematic, then fly to the element
  if (viewModeStore.isSchematic) {
    viewModeStore.setMode('geo')
  }
  // Use nextTick-style delay to ensure map is visible before flying
  setTimeout(() => {
    mapViewRef.value?.flyTo(element.lng, element.lat)
  }, 50)
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
