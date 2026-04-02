<template>
  <aside class="side-panel" :class="{ open: selectionStore.hasSelection }">
    <div v-if="element" class="panel-content">
      <div class="panel-header">
        <h3>{{ element.label }}</h3>
        <button class="close-btn" @click="selectionStore.clearSelection">&times;</button>
      </div>
      <dl class="detail-list">
        <dt>ID</dt>
        <dd>{{ element.id }}</dd>
        <dt>Type</dt>
        <dd>{{ element.type }}</dd>
        <dt>Coordinates</dt>
        <dd>{{ element.lng.toFixed(4) }}, {{ element.lat.toFixed(4) }}</dd>
        <dt>Version</dt>
        <dd>{{ element.version }}</dd>
        <dt>Updated</dt>
        <dd>{{ element.updatedAt }}</dd>
      </dl>
      <div v-if="Object.keys(element.properties).length > 0" class="properties">
        <h4>Properties</h4>
        <dl class="detail-list">
          <template v-for="(value, key) in element.properties" :key="key">
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
      </div>
    </div>
    <div v-else-if="selectionStore.hasSelection" class="panel-content">
      <p>Element not found in working set.</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'

const topologyStore = useTopologyStore()
const selectionStore = useSelectionStore()

const element = computed(() => {
  if (!selectionStore.primarySelectedId) return null
  return topologyStore.getElement(selectionStore.primarySelectedId)
})
</script>

<style scoped>
.side-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 320px;
  height: 100%;
  background: #1e1e2e;
  color: #cdd6f4;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
}

.side-panel.open {
  transform: translateX(0);
}

.panel-content {
  padding: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  background: none;
  border: none;
  color: #cdd6f4;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}

.detail-list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 13px;
}

.detail-list dt {
  color: #89b4fa;
  font-weight: 600;
}

.detail-list dd {
  margin: 0;
  word-break: break-all;
}

.properties {
  margin-top: 16px;
}

.properties h4 {
  font-size: 14px;
  margin: 0 0 8px;
}
</style>
