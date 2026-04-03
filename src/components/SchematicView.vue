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
import type { NetworkElement } from '@/types/topology'

const emit = defineEmits<{
  elementClick: [id: string]
  elementHover: [id: string | null]
}>()

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const selectionStore = useSelectionStore()
const { positions, isComputing, runLayout, updatePosition, dispose } = useForceLayout()

let deck: InstanceType<typeof Deck> | null = null
let isDragging = false
let dragNodeId: string | null = null

// Drag-box selection state
let isBoxSelecting = false
let boxStart: [number, number] | null = null

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

function handleDragStart(info: Record<string, unknown>): boolean {
  const obj = info.object as NetworkElement | undefined
  if (obj?.id) {
    // Dragging a node — reposition mode
    isDragging = true
    dragNodeId = obj.id

    // If dragging a selected node, move all selected nodes together
    return true
  }
  // No node — start drag-box selection
  const coordinate = info.coordinate as [number, number] | undefined
  if (coordinate) {
    isBoxSelecting = true
    boxStart = coordinate
  }
  return false
}

function handleDrag(info: Record<string, unknown>): void {
  const coordinate = info.coordinate as [number, number] | undefined
  if (isDragging && dragNodeId && coordinate) {
    // Move the dragged node
    const dx = coordinate[0] - (positions.value.get(dragNodeId)?.x ?? 0)
    const dy = coordinate[1] - (positions.value.get(dragNodeId)?.y ?? 0)

    // If the node is selected and there are multiple selections, move them all
    if (selectionStore.selectedIds.has(dragNodeId) && selectionStore.selectedIds.size > 1) {
      for (const id of selectionStore.selectedIds) {
        const pos = positions.value.get(id)
        if (pos) {
          positions.value.set(id, { ...pos, x: pos.x + dx, y: pos.y + dy })
        }
      }
      positions.value = new Map(positions.value)
    } else {
      updatePosition(dragNodeId, coordinate[0], coordinate[1])
    }
  }
}

function handleDragEnd(info: Record<string, unknown>): void {
  if (isBoxSelecting && boxStart) {
    const coordinate = info.coordinate as [number, number] | undefined
    if (coordinate) {
      // Select all nodes within the box
      const minX = Math.min(boxStart[0], coordinate[0])
      const maxX = Math.max(boxStart[0], coordinate[0])
      const minY = Math.min(boxStart[1], coordinate[1])
      const maxY = Math.max(boxStart[1], coordinate[1])

      const selectedIds: string[] = []
      for (const [id, pos] of positions.value) {
        if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
          selectedIds.push(id)
        }
      }
      if (selectedIds.length > 0) {
        selectionStore.selectMany(selectedIds)
      }
    }
    isBoxSelecting = false
    boxStart = null
  }

  setTimeout(() => { isDragging = false }, 50)
  dragNodeId = null
}

onMounted(() => {
  if (!canvasRef.value) return

  deck = new Deck({
    canvas: canvasRef.value,
    views: [new OrthographicView({ id: 'ortho' })],
    initialViewState: {
      target: [0, 0, 0] as [number, number, number],
      zoom: 0,
    } as any,
    controller: true,
    layers: layers.value,
    onDragStart: handleDragStart as any,
    onDrag: handleDrag as any,
    onDragEnd: handleDragEnd as any,
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
