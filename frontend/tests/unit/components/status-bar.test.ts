import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StatusBar from '@/components/StatusBar.vue'
import { useTopologyStore } from '@/stores/topology'
import { useViewportStore } from '@/stores/viewport'

describe('StatusBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows device element status at overview zoom', () => {
    const viewportStore = useViewportStore()
    const topologyStore = useTopologyStore()
    viewportStore.zoom = 8.3
    topologyStore.nodeCount = 50_000
    topologyStore.edgeCount = 0

    const wrapper = mount(StatusBar)

    expect(wrapper.text()).toContain('Elements: 50000')
    expect(wrapper.text()).toContain('Links: 0')
    expect(wrapper.text()).not.toContain('Regions')
    expect(wrapper.text()).not.toContain('Regional devices')
  })

  it('shows zero device elements before device tiles arrive', () => {
    const viewportStore = useViewportStore()
    viewportStore.zoom = 5

    const wrapper = mount(StatusBar)

    expect(wrapper.text()).toContain('Elements: 0')
    expect(wrapper.text()).not.toContain('Regions: loading')
  })

  it('shows device element status when device tiles are visible', () => {
    const viewportStore = useViewportStore()
    const topologyStore = useTopologyStore()
    viewportStore.zoom = 10.2
    topologyStore.nodeCount = 12
    topologyStore.edgeCount = 3

    const wrapper = mount(StatusBar)

    expect(wrapper.text()).toContain('Elements: 12')
    expect(wrapper.text()).toContain('Links: 3')
    expect(wrapper.text()).not.toContain('Regional devices')
  })
})
