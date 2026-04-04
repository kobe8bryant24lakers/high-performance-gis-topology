// tests/unit/stores/performance.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePerformanceStore } from '@/stores/performance'

describe('usePerformanceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns "full" degradation level for < 10K elements', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 5000
    expect(store.degradationLevel).toBe('full')
  })

  it('returns "reduced" degradation level for 10K-50K elements', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 25000
    expect(store.degradationLevel).toBe('reduced')
  })

  it('returns "minimal" degradation level for 50K-100K elements', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 75000
    expect(store.degradationLevel).toBe('minimal')
  })

  it('returns "clusters-only" degradation level for > 100K elements', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 150000
    expect(store.degradationLevel).toBe('clusters-only')
  })

  it('computes hoverEnabled based on degradation', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 5000
    expect(store.hoverEnabled).toBe(true)
    store.visibleElementCount = 25000
    expect(store.hoverEnabled).toBe(false)
  })

  it('computes pickEnabled based on degradation', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 5000
    expect(store.pickEnabled).toBe(true)
    store.visibleElementCount = 75000
    expect(store.pickEnabled).toBe(false)
  })

  it('tracks memory pressure state', () => {
    const store = usePerformanceStore()
    expect(store.memoryPressure).toBe('normal')
    store.updateHeapMb(900)
    expect(store.memoryPressure).toBe('warning')
    store.updateHeapMb(1300)
    expect(store.memoryPressure).toBe('critical')
  })

  it('manages pinned node IDs with hard limit', () => {
    const store = usePerformanceStore()
    store.pinNodes(['a', 'b', 'c'])
    expect(store.pinnedNodeIds.has('a')).toBe(true)
    store.unpinNodes(['b'])
    expect(store.pinnedNodeIds.has('b')).toBe(false)
    expect(store.pinnedNodeIds.size).toBe(2)
  })
})
