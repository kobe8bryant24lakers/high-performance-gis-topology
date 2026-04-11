<template>
  <div class="search-wrapper">
    <input
      v-model="query"
      type="text"
      placeholder="Search elements..."
      class="search-input"
      @keydown.escape="clearSearch"
    />
    <button v-if="query" class="search-clear" @click="clearSearch">&times;</button>
    <div v-if="results.length > 0" class="search-results">
      <div
        v-for="el in results"
        :key="el.id"
        class="search-result-item"
        @click="$emit('selectResult', el)"
      >
        <span class="result-label">{{ el.label }}</span>
        <span class="result-type">{{ el.type }}</span>
      </div>
      <div v-if="total > results.length" class="search-more">
        {{ total - results.length }} more results...
      </div>
    </div>
    <div v-else-if="isSearching" class="search-results">
      <div class="search-loading">Searching...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFilterStore } from '@/stores/filter'
import { useSearch } from '@/composables/use-search'
import type { NetworkElement } from '@/types/topology'

defineEmits<{
  selectResult: [element: NetworkElement]
}>()

const filterStore = useFilterStore()
const searchStore = useSearch()
const { results, total, isSearching } = storeToRefs(searchStore)

const query = ref(filterStore.criteria.searchQuery)

watch(query, (val) => {
  filterStore.setSearchQuery(val)
})

function clearSearch() {
  query.value = ''
  filterStore.setSearchQuery('')
}
</script>

<style scoped>
.search-wrapper {
  position: relative;
}

.search-input {
  width: 220px;
  padding: 4px 28px 4px 8px;
  border: 1px solid #45475a;
  border-radius: 4px;
  background: #1e1e2e;
  color: #cdd6f4;
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: #89b4fa;
}

.search-input::placeholder {
  color: #6c7086;
}

.search-clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #6c7086;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  width: 320px;
  max-height: 300px;
  overflow-y: auto;
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 4px;
  margin-top: 4px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.search-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}

.search-result-item:hover {
  background: #313244;
}

.result-label {
  color: #cdd6f4;
}

.result-type {
  color: #89b4fa;
  font-size: 11px;
}

.search-more,
.search-loading {
  padding: 8px 12px;
  color: #6c7086;
  font-size: 12px;
}
</style>
