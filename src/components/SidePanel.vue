<template>
  <aside class="side-panel" :class="{ open: isOpen }">
    <div v-if="isOpen" class="panel-tabs">
      <button
        v-if="selectionStore.hasSelection"
        class="tab"
        :class="{ active: activeTab === 'detail' }"
        @click="activeTab = 'detail'"
      >Detail</button>
      <button
        v-if="searchResults.length > 0"
        class="tab"
        :class="{ active: activeTab === 'search' }"
        @click="activeTab = 'search'"
      >Search ({{ searchResults.length }})</button>
      <button
        class="tab"
        :class="{ active: activeTab === 'filter' }"
        @click="activeTab = 'filter'"
      >Filters</button>
    </div>

    <div v-if="activeTab === 'detail'" class="panel-content">
      <div v-if="element" class="panel-section">
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
    </div>

    <div v-if="activeTab === 'search'" class="panel-content">
      <div
        v-for="el in searchResults"
        :key="el.id"
        class="search-result"
        @click="$emit('flyTo', el)"
      >
        <span class="result-label">{{ el.label }}</span>
        <span class="result-type">{{ el.type }}</span>
      </div>
    </div>

    <div v-if="activeTab === 'filter'" class="panel-content">
      <FilterPanel />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useSearch } from '@/composables/use-search'
import FilterPanel from '@/components/FilterPanel.vue'
import type { NetworkElement } from '@/types/topology'

defineEmits<{
  flyTo: [element: NetworkElement]
}>()

const topologyStore = useTopologyStore()
const selectionStore = useSelectionStore()
const { results: searchResults } = useSearch()

const activeTab = ref<'detail' | 'search' | 'filter'>('detail')

const element = computed(() => {
  if (!selectionStore.primarySelectedId) return null
  return topologyStore.getElement(selectionStore.primarySelectedId)
})

const isOpen = computed(
  () => selectionStore.hasSelection || searchResults.value.length > 0 || activeTab.value === 'filter',
)

watch(() => selectionStore.hasSelection, (has) => {
  if (has) activeTab.value = 'detail'
})

watch(searchResults, (results) => {
  if (results.length > 0) activeTab.value = 'search'
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
  display: flex;
  flex-direction: column;
}

.side-panel.open {
  transform: translateX(0);
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 8px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #6c7086;
  font-size: 12px;
  cursor: pointer;
}

.tab.active {
  color: #89b4fa;
  border-bottom-color: #89b4fa;
}

.panel-content {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
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

.search-result {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #313244;
  cursor: pointer;
  font-size: 13px;
}

.search-result:hover {
  background: #313244;
  margin: 0 -16px;
  padding: 8px 16px;
}

.result-label {
  color: #cdd6f4;
}

.result-type {
  color: #89b4fa;
  font-size: 11px;
}
</style>
