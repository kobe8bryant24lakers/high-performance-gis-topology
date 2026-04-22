import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import FilterPanel from '@/components/FilterPanel.vue'

describe('FilterPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders a typed icon for each available NE type', () => {
    const wrapper = mount(FilterPanel)
    const icons = wrapper.findAll('[data-test="ne-filter-icon"]')

    expect(icons).toHaveLength(5)
    expect(wrapper.text()).toContain('Access Point')
  })
})
