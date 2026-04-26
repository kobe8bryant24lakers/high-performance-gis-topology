import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import SidePanel from '@/components/SidePanel.vue'
import { useSelectionStore } from '@/stores/selection'
import { useSearchStore } from '@/composables/use-search'
import { useTopologyStore } from '@/stores/topology'

describe('SidePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows the NE icon beside the selected element type and search results', async () => {
    const topologyStore = useTopologyStore()
    topologyStore.mergeTileElements('z0/x0/y0', {
      elements: [
        {
          id: 'el-1',
          type: 'firewall',
          label: 'fw-1',
          lng: 0,
          lat: 0,
          version: 1,
          updatedAt: '2026-01-01T00:00:00Z',
          properties: {},
        },
      ],
      clusters: [],
      generation: 1,
      removedIds: [],
    })

    const selectionStore = useSelectionStore()
    selectionStore.selectElement('el-1')

    const searchStore = useSearchStore()
    searchStore.results = [
      {
        id: 'el-1',
        type: 'firewall',
        label: 'fw-1',
        lng: 0,
        lat: 0,
        version: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        properties: {},
      },
    ]

    const wrapper = mount(SidePanel, {
      global: {
        stubs: {
          BreadcrumbTrail: true,
          FilterPanel: true,
        },
      },
    })

    expect(wrapper.find('[data-test="detail-type-icon"]').attributes('src')).toMatch(/^data:image\/svg\+xml,/)
    await wrapper.findAll('button.tab')[1]?.trigger('click')
    expect(wrapper.find('[data-test="search-type-icon"]').attributes('src')).toMatch(/^data:image\/svg\+xml,/)
  })
})
