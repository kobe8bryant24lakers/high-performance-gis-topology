// tests/unit/stores/view-mode.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useViewModeStore } from '@/stores/view-mode'

describe('useViewModeStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults to geo mode', () => {
    const store = useViewModeStore()
    expect(store.mode).toBe('geo')
  })

  it('toggles to schematic', () => {
    const store = useViewModeStore()
    store.setMode('schematic')
    expect(store.mode).toBe('schematic')
  })

  it('toggles back to geo', () => {
    const store = useViewModeStore()
    store.setMode('schematic')
    store.setMode('geo')
    expect(store.mode).toBe('geo')
  })

  it('toggle() flips between modes', () => {
    const store = useViewModeStore()
    expect(store.mode).toBe('geo')
    store.toggle()
    expect(store.mode).toBe('schematic')
    store.toggle()
    expect(store.mode).toBe('geo')
  })

  it('isSchematic computed is reactive', () => {
    const store = useViewModeStore()
    expect(store.isSchematic).toBe(false)
    store.setMode('schematic')
    expect(store.isSchematic).toBe(true)
  })
})
