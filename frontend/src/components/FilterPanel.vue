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

    <div class="filter-section">
      <h4>Properties</h4>
      <div class="property-filter">
        <input
          v-model="propKey"
          type="text"
          placeholder="Key"
          class="prop-input"
        />
        <input
          v-model="propValue"
          type="text"
          placeholder="Value"
          class="prop-input"
        />
        <button
          class="prop-add-btn"
          :disabled="!propKey || !propValue"
          @click="addPropertyFilter"
        >Add</button>
      </div>
      <div v-if="Object.keys(filterStore.criteria.propertyFilters).length > 0" class="active-props">
        <span
          v-for="(value, key) in filterStore.criteria.propertyFilters"
          :key="key"
          class="prop-chip"
        >
          {{ key }}={{ value }}
          <button class="chip-remove" @click="filterStore.removePropertyFilter(String(key))">&times;</button>
        </span>
      </div>
    </div>

    <div v-if="filterStore.hasActiveFilters" class="filter-actions">
      <button class="clear-btn" @click="filterStore.clearAll">Clear all filters</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useFilterStore } from '@/stores/filter'

const filterStore = useFilterStore()

const availableTypes = ['router', 'switch', 'server', 'firewall', 'access-point']

const propKey = ref('')
const propValue = ref('')

function addPropertyFilter() {
  if (propKey.value && propValue.value) {
    filterStore.setPropertyFilter(propKey.value, propValue.value)
    propKey.value = ''
    propValue.value = ''
  }
}
</script>

<style scoped>
.filter-panel {
  padding: 12px;
}

.filter-section {
  margin-bottom: 16px;
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

.property-filter {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.prop-input {
  flex: 1;
  padding: 3px 6px;
  border: 1px solid #45475a;
  border-radius: 3px;
  background: #181825;
  color: #cdd6f4;
  font-size: 12px;
  outline: none;
}

.prop-input:focus {
  border-color: #89b4fa;
}

.prop-add-btn {
  padding: 3px 8px;
  border: 1px solid #45475a;
  border-radius: 3px;
  background: #313244;
  color: #cdd6f4;
  font-size: 12px;
  cursor: pointer;
}

.prop-add-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.active-props {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.prop-chip {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: #313244;
  border-radius: 8px;
  font-size: 11px;
  color: #cdd6f4;
}

.chip-remove {
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 12px;
  cursor: pointer;
  padding: 0 2px;
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
