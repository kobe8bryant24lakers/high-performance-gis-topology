<template>
  <nav v-if="explorationStore.breadcrumbs.length > 0" class="breadcrumb-trail">
    <ol class="breadcrumb-list">
      <li
        v-for="(crumb, index) in explorationStore.breadcrumbs"
        :key="crumb.id + '-' + index"
        class="breadcrumb-item"
        :class="{ current: index === explorationStore.breadcrumbs.length - 1 }"
      >
        <button
          v-if="index < explorationStore.breadcrumbs.length - 1"
          class="breadcrumb-link"
          @click="onNavigate(index, crumb)"
        >{{ crumb.label }}</button>
        <span v-else class="breadcrumb-current">{{ crumb.label }}</span>
        <span v-if="index < explorationStore.breadcrumbs.length - 1" class="breadcrumb-sep">&rsaquo;</span>
      </li>
    </ol>
    <button class="breadcrumb-clear" @click="onClear">Clear trail</button>
  </nav>
</template>

<script setup lang="ts">
import { useExplorationStore, type BreadcrumbEntry } from '@/stores/exploration'
import { useSelectionStore } from '@/stores/selection'

const emit = defineEmits<{
  navigate: [id: string]
}>()

const explorationStore = useExplorationStore()
const selectionStore = useSelectionStore()

function onNavigate(index: number, crumb: BreadcrumbEntry) {
  explorationStore.navigateTo(index)
  selectionStore.selectElement(crumb.id)
  emit('navigate', crumb.id)
}

function onClear() {
  explorationStore.clearExploration()
}
</script>

<style scoped>
.breadcrumb-trail {
  padding: 8px 16px;
  border-bottom: 1px solid #313244;
  font-size: 12px;
}

.breadcrumb-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
  align-items: center;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.breadcrumb-link {
  background: none;
  border: none;
  color: #89b4fa;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
  border-radius: 3px;
}

.breadcrumb-link:hover {
  background: #313244;
}

.breadcrumb-current {
  color: #cdd6f4;
  font-weight: 600;
  padding: 2px 4px;
}

.breadcrumb-sep {
  color: #6c7086;
}

.breadcrumb-clear {
  background: none;
  border: none;
  color: #6c7086;
  font-size: 11px;
  cursor: pointer;
  padding: 4px 0 0;
}

.breadcrumb-clear:hover {
  color: #f38ba8;
}
</style>
