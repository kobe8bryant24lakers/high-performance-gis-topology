import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSelectionStore } from '@/stores/selection'

describe('useSelectionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('selects a single element', () => {
    const store = useSelectionStore()
    store.selectElement('el-1')
    expect(store.selectedIds).toEqual(new Set(['el-1']))
    expect(store.primarySelectedId).toBe('el-1')
  })

  it('toggles selection with ctrl-click', () => {
    const store = useSelectionStore()
    store.selectElement('el-1')
    store.toggleElement('el-2')
    expect(store.selectedIds.size).toBe(2)
    store.toggleElement('el-1')
    expect(store.selectedIds.size).toBe(1)
    expect(store.selectedIds.has('el-2')).toBe(true)
  })

  it('clears selection', () => {
    const store = useSelectionStore()
    store.selectElement('el-1')
    store.toggleElement('el-2')
    store.clearSelection()
    expect(store.selectedIds.size).toBe(0)
    expect(store.primarySelectedId).toBeNull()
  })

  it('caps selection at 500 elements', () => {
    const store = useSelectionStore()
    for (let i = 0; i < 510; i++) {
      store.toggleElement(`el-${i}`)
    }
    expect(store.selectedIds.size).toBe(500)
  })
})
