import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StatusBar from '@/components/StatusBar.vue'
import { useRegionStore } from '@/stores/regions'
import { useTopologyStore } from '@/stores/topology'
import { useViewportStore } from '@/stores/viewport'

function regionSummary() {
  return {
    level: 'city' as const,
    generation: 1,
    regions: [
      {
        id: 'city-a',
        level: 'city' as const,
        name: 'City A',
        parentId: null,
        centroidLng: 0,
        centroidLat: 0,
        bbox: { west: -1, south: -1, east: 1, north: 1 },
        totalCount: 28_800,
        elementTypes: {
          firewall: 1_000,
          router: 2_000,
          switch: 10_000,
          server: 5_000,
          'access-point': 10_800,
        },
        internalLinkCount: 12,
      },
      {
        id: 'city-b',
        level: 'city' as const,
        name: 'City B',
        parentId: null,
        centroidLng: 10,
        centroidLat: 10,
        bbox: { west: 9, south: 9, east: 11, north: 11 },
        totalCount: 1_200,
        elementTypes: {
          firewall: 100,
          router: 200,
          switch: 300,
          server: 300,
          'access-point': 300,
        },
        internalLinkCount: 4,
      },
    ],
    links: [
      { id: 'a-b', sourceRegionId: 'city-a', targetRegionId: 'city-b', count: 7 },
      { id: 'b-a', sourceRegionId: 'city-b', targetRegionId: 'city-a', count: 6 },
    ],
  }
}

describe('StatusBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows region aggregate status instead of zero device elements in region mode', () => {
    const viewportStore = useViewportStore()
    const regionStore = useRegionStore()
    viewportStore.zoom = 8.3
    regionStore.replaceSummary(regionSummary())

    const wrapper = mount(StatusBar)

    expect(wrapper.text()).toContain('Regions: 2')
    expect(wrapper.text()).toContain('Regional devices: 30.0k')
    expect(wrapper.text()).toContain('Region links: 2')
    expect(wrapper.text()).not.toContain('Elements: 0')
  })

  it('shows region loading status instead of zero device elements before summaries arrive', () => {
    const viewportStore = useViewportStore()
    viewportStore.zoom = 2

    const wrapper = mount(StatusBar)

    expect(wrapper.text()).toContain('Regions: loading')
    expect(wrapper.text()).not.toContain('Elements: 0')
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
