<template>
  <div class="filter-panel">
    <div class="filter-section">
      <h4>Element Type</h4>
      <label
        v-for="t in availableTypes"
        :key="t"
        class="filter-checkbox"
      >
        <input
          type="checkbox"
          :checked="filterStore.criteria.types.includes(t)"
          @change="filterStore.toggleType(t)"
        />
        {{ t }}
      </label>
    </div>
    <div v-if="filterStore.hasActiveFilters" class="filter-actions">
      <button class="clear-btn" @click="filterStore.clearAll">Clear all filters</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFilterStore } from '@/stores/filter'

const filterStore = useFilterStore()

const availableTypes = ['router', 'switch', 'server', 'firewall', 'access-point']
</script>

<style scoped>
.filter-panel {
  padding: 12px;
}

.filter-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #89b4fa;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 13px;
  color: #cdd6f4;
  cursor: pointer;
}

.filter-checkbox input {
  accent-color: #89b4fa;
}

.filter-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #313244;
}

.clear-btn {
  background: none;
  border: 1px solid #45475a;
  color: #cdd6f4;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.clear-btn:hover {
  background: #313244;
}
</style>
