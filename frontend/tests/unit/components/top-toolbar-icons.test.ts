import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import TopToolbar from '@/components/TopToolbar.vue'
import { useFilterStore } from '@/stores/filter'

describe('TopToolbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders icon-backed chips for active type filters', () => {
    const filterStore = useFilterStore()
    filterStore.setTypeFilter(['router'])

    const wrapper = mount(TopToolbar, {
      global: {
        stubs: {
          SearchInput: true,
        },
      },
    })

    expect(wrapper.find('[data-test="active-type-chip-icon"]').attributes('src')).toMatch(/^data:image\/svg\+xml,/)
    expect(wrapper.text()).toContain('Router')
  })
})
