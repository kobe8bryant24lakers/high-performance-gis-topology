// src/stores/view-mode.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type ViewMode = 'geo' | 'schematic'

export const useViewModeStore = defineStore('viewMode', () => {
  const mode = ref<ViewMode>('geo')

  function setMode(m: ViewMode) {
    mode.value = m
  }

  function toggle() {
    mode.value = mode.value === 'geo' ? 'schematic' : 'geo'
  }

  const isSchematic = computed(() => mode.value === 'schematic')

  return { mode, isSchematic, setMode, toggle }
})
