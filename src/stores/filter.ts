// src/stores/filter.ts
import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import type { FilterCriteria, NetworkElement } from '@/types/topology'

export const useFilterStore = defineStore('filter', () => {
  const criteria = reactive<FilterCriteria>({
    types: [],
    searchQuery: '',
    propertyFilters: {},
  })

  const hasActiveFilters = computed(
    () =>
      criteria.types.length > 0 ||
      criteria.searchQuery.length > 0 ||
      Object.keys(criteria.propertyFilters).length > 0,
  )

  function setTypeFilter(types: string[]) {
    criteria.types = [...types]
  }

  function toggleType(type: string) {
    const idx = criteria.types.indexOf(type)
    if (idx >= 0) {
      criteria.types.splice(idx, 1)
    } else {
      criteria.types.push(type)
    }
  }

  function setSearchQuery(query: string) {
    criteria.searchQuery = query
  }

  function setPropertyFilter(key: string, value: string) {
    criteria.propertyFilters[key] = value
  }

  function removePropertyFilter(key: string) {
    delete criteria.propertyFilters[key]
  }

  function clearAll() {
    criteria.types = []
    criteria.searchQuery = ''
    const keys = Object.keys(criteria.propertyFilters)
    for (const k of keys) delete criteria.propertyFilters[k]
  }

  function matchesElement(el: NetworkElement): boolean {
    if (criteria.types.length > 0 && !criteria.types.includes(el.type)) {
      return false
    }
    for (const [key, value] of Object.entries(criteria.propertyFilters)) {
      if (String(el.properties[key] ?? '') !== value) return false
    }
    return true
  }

  return {
    criteria,
    hasActiveFilters,
    setTypeFilter,
    toggleType,
    setSearchQuery,
    setPropertyFilter,
    removePropertyFilter,
    clearAll,
    matchesElement,
  }
})
