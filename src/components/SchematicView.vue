<template>
  <div ref="containerRef" class="schematic-view">
    <canvas ref="canvasRef" class="schematic-canvas" />
    <div v-if="isComputing" class="computing-indicator">Computing layout...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Deck, OrthographicView } from '@deck.gl/core'
import { useSelectionStore } from '@/stores/selection'
import { useForceLayout } from '@/composables/use-force-layout'
import { useDeckLayers } from '@/composables/use-deck-layers'

const emit = defineEmits<{
  elementClick: [id: string]
  elementHover: [id: string | null]
}>()

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const selectionStore = useSelectionStore()
const { positions, isComputing, runLayout, updatePosition, dispose } = useForceLayout()

let deck: Deck | null = null
let isDragging = false
let dragNodeId: string | null = null

function handleClick(id: string, event?: PointerEvent) {
  if (!isDragging) {
    if (event?.ctrlKey || event?.metaKey) {
      selectionStore.toggleElement(id)
    } else {
      selectionStore.selectElement(id)
    }
    emit('elementClick', id)
  }
}

function handleHover(id: string | null) {
  emit('elementHover', id)
}

const { layers } = useDeckLayers(handleClick, handleHover, () => positions.value)

onMounted(() => {
  if (!canvasRef.value) return

  deck = new Deck({
    canvas: canvasRef.value,
    views: [new OrthographicView({ id: 'ortho' })],
    initialViewState: {
      target: [0, 0, 0],
      zoom: 0,
    },
    controller: true,
    layers: layers.value,
    onDragStart: (info: any) => {
      if (info.object && info.object.id) {
        isDragging = true
        dragNodeId = info.object.id
        return true
      }
      return false
    },
    onDrag: (info: any) => {
      if (isDragging && dragNodeId && info.coordinate) {
        updatePosition(dragNodeId, info.coordinate[0], info.coordinate[1])
      }
    },
    onDragEnd: () => {
      setTimeout(() => { isDragging = false }, 50)
      dragNodeId = null
    },
  })

  runLayout()

  watch(layers, (newLayers) => {
    deck?.setProps({ layers: newLayers })
  })
})

onUnmounted(() => {
  deck?.finalize()
  deck = null
  dispose()
})
</script>

<style scoped>
.schematic-view {
  position: relative;
  width: 100%;
  height: 100%;
  background: #11111b;
}

.schematic-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.computing-indicator {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24, 24, 37, 0.9);
  color: #cdd6f4;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 5;
}
</style>
