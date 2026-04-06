import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useExplorationStore } from '@/stores/exploration'

describe('explorationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with empty breadcrumb trail', () => {
    const store = useExplorationStore()
    expect(store.breadcrumbs).toEqual([])
    expect(store.expandedNodeIds.size).toBe(0)
  })

  it('pushes breadcrumb entries', () => {
    const store = useExplorationStore()
    store.pushBreadcrumb({ id: 'n1', label: 'Node 1' })
    store.pushBreadcrumb({ id: 'n2', label: 'Node 2' })
    expect(store.breadcrumbs).toHaveLength(2)
    expect(store.breadcrumbs[0].id).toBe('n1')
    expect(store.breadcrumbs[1].id).toBe('n2')
  })

  it('enforces FIFO limit of 50 breadcrumbs', () => {
    const store = useExplorationStore()
    for (let i = 0; i < 55; i++) {
      store.pushBreadcrumb({ id: `n${i}`, label: `Node ${i}` })
    }
    expect(store.breadcrumbs).toHaveLength(50)
    expect(store.breadcrumbs[0].id).toBe('n5')
    expect(store.breadcrumbs[49].id).toBe('n54')
  })

  it('deduplicates consecutive breadcrumbs for same id', () => {
    const store = useExplorationStore()
    store.pushBreadcrumb({ id: 'n1', label: 'Node 1' })
    store.pushBreadcrumb({ id: 'n1', label: 'Node 1' })
    expect(store.breadcrumbs).toHaveLength(1)
  })

  it('navigates back to a breadcrumb index', () => {
    const store = useExplorationStore()
    store.pushBreadcrumb({ id: 'n1', label: 'Node 1' })
    store.pushBreadcrumb({ id: 'n2', label: 'Node 2' })
    store.pushBreadcrumb({ id: 'n3', label: 'Node 3' })
    store.navigateTo(1)
    expect(store.breadcrumbs).toHaveLength(2)
    expect(store.breadcrumbs[1].id).toBe('n2')
  })

  it('tracks expanded node IDs with a cap of 2000', () => {
    const store = useExplorationStore()
    const ids = Array.from({ length: 2000 }, (_, i) => `n${i}`)
    store.addExpandedNodes(ids)
    expect(store.expandedNodeIds.size).toBe(2000)
    expect(store.canExpand).toBe(false)
  })

  it('canExpand is true when under the limit', () => {
    const store = useExplorationStore()
    store.addExpandedNodes(['n1', 'n2'])
    expect(store.canExpand).toBe(true)
  })

  it('clearExploration resets all state', () => {
    const store = useExplorationStore()
    store.pushBreadcrumb({ id: 'n1', label: 'Node 1' })
    store.addExpandedNodes(['n1', 'n2'])
    store.clearExploration()
    expect(store.breadcrumbs).toEqual([])
    expect(store.expandedNodeIds.size).toBe(0)
  })

  it('isExpanding tracks loading state', () => {
    const store = useExplorationStore()
    expect(store.isExpanding).toBe(false)
    store.setExpanding(true)
    expect(store.isExpanding).toBe(true)
  })
})

describe('explorationStore edge cases', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('navigateTo with out-of-bounds index is a no-op', () => {
    const store = useExplorationStore()
    store.pushBreadcrumb({ id: 'n1', label: 'Node 1' })
    store.navigateTo(5)
    expect(store.breadcrumbs).toHaveLength(1)
    store.navigateTo(-1)
    expect(store.breadcrumbs).toHaveLength(1)
  })

  it('addExpandedNodes does not exceed cap even with repeated calls', () => {
    const store = useExplorationStore()
    for (let batch = 0; batch < 5; batch++) {
      const ids = Array.from({ length: 500 }, (_, i) => `batch${batch}-n${i}`)
      store.addExpandedNodes(ids)
    }
    expect(store.expandedNodeIds.size).toBe(2000)
    expect(store.canExpand).toBe(false)
  })

  it('clearExploration re-enables expansion', () => {
    const store = useExplorationStore()
    const ids = Array.from({ length: 2000 }, (_, i) => `n${i}`)
    store.addExpandedNodes(ids)
    expect(store.canExpand).toBe(false)
    store.clearExploration()
    expect(store.canExpand).toBe(true)
  })
})
