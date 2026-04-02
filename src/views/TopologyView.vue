<template>
  <div class="topology-view">
    <TopToolbar @fly-to="onFlyTo" />
    <div class="main-area">
      <SidePanel @fly-to="onFlyTo" />
      <MapView
        v-if="!viewModeStore.isSchematic"
        @element-click="onElementClick"
        @element-hover="onElementHover"
      />
      <SchematicView
        v-else
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
import SchematicView from '@/components/SchematicView.vue'
import SidePanel from '@/components/SidePanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import { useViewModeStore } from '@/stores/view-mode'
import type { NetworkElement } from '@/types/topology'

const viewModeStore = useViewModeStore()

function onElementClick(id: string) {
  // Selection is handled inside views via the selection store
}

function onElementHover(id: string | null) {
  // Future: tooltip rendering
}

function onFlyTo(element: NetworkElement) {
  // Future: animate viewport to element position
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
