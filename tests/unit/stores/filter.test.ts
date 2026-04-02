// tests/unit/stores/filter.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFilterStore } from '@/stores/filter'

describe('useFilterStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts with empty filters', () => {
    const store = useFilterStore()
    expect(store.criteria.types).toEqual([])
    expect(store.criteria.searchQuery).toBe('')
    expect(store.criteria.propertyFilters).toEqual({})
    expect(store.hasActiveFilters).toBe(false)
  })

  it('setTypeFilter sets type list', () => {
    const store = useFilterStore()
    store.setTypeFilter(['router', 'switch'])
    expect(store.criteria.types).toEqual(['router', 'switch'])
    expect(store.hasActiveFilters).toBe(true)
  })

  it('toggleType adds and removes', () => {
    const store = useFilterStore()
    store.toggleType('router')
    expect(store.criteria.types).toEqual(['router'])
    store.toggleType('switch')
    expect(store.criteria.types).toEqual(['router', 'switch'])
    store.toggleType('router')
    expect(store.criteria.types).toEqual(['switch'])
  })

  it('setSearchQuery updates query', () => {
    const store = useFilterStore()
    store.setSearchQuery('test')
    expect(store.criteria.searchQuery).toBe('test')
    expect(store.hasActiveFilters).toBe(true)
  })

  it('setPropertyFilter sets and removes', () => {
    const store = useFilterStore()
    store.setPropertyFilter('status', 'active')
    expect(store.criteria.propertyFilters).toEqual({ status: 'active' })
    expect(store.hasActiveFilters).toBe(true)
    store.removePropertyFilter('status')
    expect(store.criteria.propertyFilters).toEqual({})
  })

  it('clearAll resets everything', () => {
    const store = useFilterStore()
    store.setTypeFilter(['router'])
    store.setSearchQuery('test')
    store.setPropertyFilter('status', 'active')
    store.clearAll()
    expect(store.criteria.types).toEqual([])
    expect(store.criteria.searchQuery).toBe('')
    expect(store.criteria.propertyFilters).toEqual({})
    expect(store.hasActiveFilters).toBe(false)
  })

  it('matchesElement filters by type', () => {
    const store = useFilterStore()
    const el = { id: '1', type: 'router', label: 'r1', lng: 0, lat: 0, version: 1, updatedAt: '', properties: {} }
    expect(store.matchesElement(el)).toBe(true)
    store.setTypeFilter(['switch'])
    expect(store.matchesElement(el)).toBe(false)
    store.setTypeFilter(['router', 'switch'])
    expect(store.matchesElement(el)).toBe(true)
  })

  it('matchesElement filters by property', () => {
    const store = useFilterStore()
    const el = { id: '1', type: 'router', label: 'r1', lng: 0, lat: 0, version: 1, updatedAt: '', properties: { status: 'active' } }
    store.setPropertyFilter('status', 'active')
    expect(store.matchesElement(el)).toBe(true)
    store.setPropertyFilter('status', 'inactive')
    expect(store.matchesElement(el)).toBe(false)
  })
})
