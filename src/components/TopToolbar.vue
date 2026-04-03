<template>
  <header class="toolbar">
    <div class="toolbar-title">GIS Topology Viewer</div>
    <div class="toolbar-controls">
      <SearchInput @select-result="$emit('flyTo', $event)" />
      <button class="view-toggle" @click="viewModeStore.toggle()">
        {{ viewModeStore.isSchematic ? 'Map' : 'Schematic' }}
      </button>
    </div>
    <div class="toolbar-spacer" />
    <div v-if="filterStore.hasActiveFilters" class="filter-chips">
      <span v-if="filterStore.criteria.searchQuery" class="chip chip-search">
        search: {{ filterStore.criteria.searchQuery }}
        <button class="chip-remove" @click="filterStore.setSearchQuery('')">&times;</button>
      </span>
      <span
        v-for="t in filterStore.criteria.types"
        :key="'type-' + t"
        class="chip"
      >
        {{ t }}
        <button class="chip-remove" @click="filterStore.toggleType(t)">&times;</button>
      </span>
      <span
        v-for="(value, key) in filterStore.criteria.propertyFilters"
        :key="'prop-' + key"
        class="chip chip-prop"
      >
        {{ key }}={{ value }}
        <button class="chip-remove" @click="filterStore.removePropertyFilter(String(key))">&times;</button>
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useViewModeStore } from '@/stores/view-mode'
import { useFilterStore } from '@/stores/filter'
import SearchInput from '@/components/SearchInput.vue'
import type { NetworkElement } from '@/types/topology'

defineEmits<{
  flyTo: [element: NetworkElement]
}>()

const viewModeStore = useViewModeStore()
const filterStore = useFilterStore()
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  background: #181825;
  color: #cdd6f4;
  border-bottom: 1px solid #313244;
  z-index: 20;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-toggle {
  padding: 4px 12px;
  border: 1px solid #45475a;
  border-radius: 4px;
  background: #1e1e2e;
  color: #cdd6f4;
  font-size: 13px;
  cursor: pointer;
}

.view-toggle:hover {
  background: #313244;
}

.toolbar-spacer {
  flex: 1;
}

.filter-chips {
  display: flex;
  gap: 6px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #313244;
  border-radius: 12px;
  font-size: 12px;
  color: #cdd6f4;
}

.chip-search {
  background: #45475a;
}

.chip-prop {
  background: #3b3f5c;
}

.chip-remove {
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
}
</style>
