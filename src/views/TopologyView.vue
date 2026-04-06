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
    <KeyboardHelpOverlay
      :visible="showHelp"
      :shortcuts="registry"
      @close="showHelp = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TopToolbar from '@/components/TopToolbar.vue'
import MapView from '@/components/MapView.vue'
import SchematicView from '@/components/SchematicView.vue'
import SidePanel from '@/components/SidePanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import KeyboardHelpOverlay from '@/components/KeyboardHelpOverlay.vue'
import { useViewModeStore } from '@/stores/view-mode'
import { useSelectionStore } from '@/stores/selection'
import { useExplorationStore } from '@/stores/exploration'
import { useKeyboardShortcuts } from '@/composables/use-keyboard-shortcuts'
import { telemetry } from '@/utils/telemetry'
import type { NetworkElement } from '@/types/topology'

const viewModeStore = useViewModeStore()
const selectionStore = useSelectionStore()
const explorationStore = useExplorationStore()
const mapViewRef = ref<InstanceType<typeof MapView> | null>(null)

const { showHelp, registry } = useKeyboardShortcuts([
  {
    key: 'Escape',
    label: 'Clear selection',
    handler: () => {
      selectionStore.clearSelection()
      showHelp.value = false
    },
  },
  {
    key: '/',
    label: 'Focus search',
    handler: () => {
      const input = document.querySelector<HTMLInputElement>('.search-input input')
      input?.focus()
    },
  },
  {
    key: 'Tab',
    label: 'Toggle geo/schematic view',
    handler: () => viewModeStore.toggle(),
  },
  {
    key: '?',
    shift: true,
    label: 'Show keyboard shortcuts',
    handler: () => { showHelp.value = !showHelp.value },
  },
  {
    key: 'Backspace',
    label: 'Navigate back in breadcrumb trail',
    handler: () => {
      if (explorationStore.breadcrumbs.length > 1) {
        explorationStore.navigateTo(explorationStore.breadcrumbs.length - 2)
        const prev = explorationStore.breadcrumbs[explorationStore.breadcrumbs.length - 1]
        if (prev) selectionStore.selectElement(prev.id)
      }
    },
  },
])

function onElementClick(id: string) {
  // Selection is handled inside views via the selection store
}

function onElementHover(id: string | null) {
  // Future: tooltip rendering
}

function onFlyTo(element: NetworkElement) {
  telemetry.emit('fly_to', 1)
  if (viewModeStore.isSchematic) {
    viewModeStore.setMode('geo')
  }
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
