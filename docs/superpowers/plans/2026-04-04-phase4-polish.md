# Phase 4: Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add topology exploration (expand neighbors with breadcrumb trail), keyboard shortcuts, and comprehensive telemetry instrumentation to complete the GIS topology viewer.

**Architecture:** Topology exploration uses a dedicated Pinia store (`exploration`) to track breadcrumb history and expanded neighbor sets, with a composable (`use-exploration`) orchestrating API calls and graph merging. Keyboard shortcuts use a single composable registered at the TopologyView level. Telemetry calls are added to existing composables/stores at key interaction points.

**Tech Stack:** Vue 3, TypeScript, Pinia, Graphology, Vitest, MSW (mock handlers)

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `src/stores/exploration.ts` | Breadcrumb trail state, expanded neighbor tracking, pin category limits |
| **Create:** `src/composables/use-exploration.ts` | Fetch neighbors API, merge into graph, coordinate with exploration store |
| **Create:** `src/composables/use-keyboard-shortcuts.ts` | Register/unregister global keyboard shortcuts, shortcut registry |
| **Create:** `src/components/BreadcrumbTrail.vue` | Breadcrumb navigation UI in side panel |
| **Create:** `src/components/KeyboardHelpOverlay.vue` | Modal showing available keyboard shortcuts |
| **Create:** `tests/unit/stores/exploration.test.ts` | Unit tests for exploration store |
| **Create:** `tests/unit/composables/use-keyboard-shortcuts.test.ts` | Unit tests for keyboard shortcut composable |
| **Create:** `tests/unit/composables/use-exploration.test.ts` | Unit tests for exploration composable |
| **Modify:** `src/mock/handlers.ts` | Add `/api/topology/elements/:id/neighbors` mock endpoint |
| **Modify:** `src/api/tile-service.ts` | Add `fetchNeighbors(id, depth)` method |
| **Modify:** `src/components/SidePanel.vue` | Add "Expand Neighbors" button, breadcrumb trail, exploration tab |
| **Modify:** `src/views/TopologyView.vue` | Wire keyboard shortcuts composable |
| **Modify:** `src/stores/performance.ts` | Add `explorationPinnedIds` tracking for neighbor pin category |
| **Modify:** `src/utils/telemetry.ts` | No changes needed — existing API is sufficient |
| **Modify:** `src/composables/use-search.ts` | Add `search_ms` telemetry |
| **Modify:** `src/composables/use-deck-layers.ts` | Add telemetry for layer rebuild timing |

---

### Task 1: Mock Neighbors Endpoint

**Files:**
- Modify: `src/mock/handlers.ts`
- Test: Manual — verified by Task 3 integration

This task adds the mock API endpoint that returns neighbors for a given element ID, matching the design spec contract: `GET /api/topology/elements/:id/neighbors?depth={n}`.

- [ ] **Step 1: Add neighbors endpoint to mock handlers**

In `src/mock/handlers.ts`, add a new handler after the existing `GET /api/topology/elements/:id` handler (line 89). The handler finds the element, collects links where the element is a source or target, then collects the neighbor elements from those links.

```typescript
// Add this handler inside the handlers array, after the /api/topology/elements/:id handler:

http.get('/api/topology/elements/:id/neighbors', ({ params, request }) => {
  const id = params.id as string
  const element = ALL_ELEMENTS.find((e) => e.id === id)
  if (!element) return new HttpResponse(null, { status: 404 })

  const url = new URL(request.url)
  const depth = Math.min(Number(url.searchParams.get('depth') ?? '1'), 3)

  // BFS to collect neighbors up to depth
  const visited = new Set<string>([id])
  const resultElements: typeof ALL_ELEMENTS = []
  const resultLinks: typeof ALL_LINKS = []
  let frontier = [id]

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const nextFrontier: string[] = []
    for (const nodeId of frontier) {
      const connectedLinks = ALL_LINKS.filter(
        (l) => l.sourceId === nodeId || l.targetId === nodeId,
      )
      for (const link of connectedLinks) {
        if (!resultLinks.some((rl) => rl.id === link.id)) {
          resultLinks.push(link)
        }
        const neighborId = link.sourceId === nodeId ? link.targetId : link.sourceId
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          const neighbor = ALL_ELEMENTS.find((e) => e.id === neighborId)
          if (neighbor) {
            resultElements.push(neighbor)
            nextFrontier.push(neighborId)
          }
        }
      }
    }
    frontier = nextFrontier
  }

  return HttpResponse.json({ elements: resultElements, links: resultLinks })
}),
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/mock/handlers.ts
git commit -m "feat: add mock neighbors endpoint for topology exploration"
```

---

### Task 2: Exploration Store

**Files:**
- Create: `src/stores/exploration.ts`
- Create: `tests/unit/stores/exploration.test.ts`

This store manages breadcrumb trail state and tracks which element IDs were loaded via neighbor expansion. The design spec defines limits: breadcrumb trail max 50 entries (FIFO), expanded neighbors max 2,000 elements.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/stores/exploration.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stores/exploration.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the exploration store**

Create `src/stores/exploration.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MAX_BREADCRUMBS = 50
const MAX_EXPANDED_NODES = 2_000

export interface BreadcrumbEntry {
  id: string
  label: string
}

export const useExplorationStore = defineStore('exploration', () => {
  const breadcrumbs = ref<BreadcrumbEntry[]>([])
  const expandedNodeIds = ref(new Set<string>())
  const isExpanding = ref(false)

  const canExpand = computed(() => expandedNodeIds.value.size < MAX_EXPANDED_NODES)

  function pushBreadcrumb(entry: BreadcrumbEntry) {
    // Deduplicate consecutive entries
    const last = breadcrumbs.value[breadcrumbs.value.length - 1]
    if (last?.id === entry.id) return

    breadcrumbs.value.push(entry)
    // FIFO eviction
    while (breadcrumbs.value.length > MAX_BREADCRUMBS) {
      breadcrumbs.value.shift()
    }
  }

  function navigateTo(index: number) {
    if (index < 0 || index >= breadcrumbs.value.length) return
    breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  }

  function addExpandedNodes(ids: string[]) {
    const next = new Set(expandedNodeIds.value)
    for (const id of ids) {
      if (next.size >= MAX_EXPANDED_NODES) break
      next.add(id)
    }
    expandedNodeIds.value = next
  }

  function setExpanding(value: boolean) {
    isExpanding.value = value
  }

  function clearExploration() {
    breadcrumbs.value = []
    expandedNodeIds.value = new Set()
    isExpanding.value = false
  }

  return {
    breadcrumbs,
    expandedNodeIds,
    isExpanding,
    canExpand,
    pushBreadcrumb,
    navigateTo,
    addExpandedNodes,
    setExpanding,
    clearExploration,
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/stores/exploration.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/exploration.ts tests/unit/stores/exploration.test.ts
git commit -m "feat: add exploration store with breadcrumb trail and neighbor tracking"
```

---

### Task 3: Fetch Neighbors API Method

**Files:**
- Modify: `src/api/tile-service.ts`
- Create: `tests/unit/composables/use-exploration.test.ts` (partial — API method tests)

Add a `fetchNeighbors` method to `TileService` that calls `GET /api/topology/elements/:id/neighbors?depth={n}`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/composables/use-exploration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers } from '@/mock/handlers'
import { TileService } from '@/api/tile-service'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterAll(() => server.close())

describe('TileService.fetchNeighbors', () => {
  it('fetches neighbors for a valid element', async () => {
    const service = new TileService()
    const result = await service.fetchNeighbors('el-0')
    expect(result).toBeDefined()
    expect(result!.elements).toBeInstanceOf(Array)
    expect(result!.links).toBeInstanceOf(Array)
  })

  it('returns null for non-existent element', async () => {
    const service = new TileService()
    await expect(service.fetchNeighbors('nonexistent-id')).rejects.toThrow()
  })

  it('respects depth parameter', async () => {
    const service = new TileService()
    const depth1 = await service.fetchNeighbors('el-0', 1)
    const depth2 = await service.fetchNeighbors('el-0', 2)
    expect(depth2!.elements.length).toBeGreaterThanOrEqual(depth1!.elements.length)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/composables/use-exploration.test.ts`
Expected: FAIL — `fetchNeighbors` does not exist on TileService

- [ ] **Step 3: Add fetchNeighbors to TileService**

In `src/api/tile-service.ts`, add after the `fetchTileLinks` method (after line 65):

```typescript
async fetchNeighbors(
  elementId: string,
  depth: number = 1,
  signal?: AbortSignal,
): Promise<NeighborsResponse> {
  const key = `neighbors/${elementId}`
  this.controllers.get(key)?.abort()

  const controller = new AbortController()
  this.controllers.set(key, controller)

  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal

  try {
    return await apiGet<NeighborsResponse>(
      `/api/topology/elements/${encodeURIComponent(elementId)}/neighbors?depth=${depth}`,
      { signal: combinedSignal, maxRetries: 2, baseDelayMs: 500 },
    )
  } finally {
    this.controllers.delete(key)
  }
}
```

Also add the import at the top of `src/api/tile-service.ts` (line 1):

```typescript
import { apiGet } from './client'
import type { TileElementsResponse, TileLinksResponse, NeighborsResponse } from '@/types/topology'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/composables/use-exploration.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/api/tile-service.ts tests/unit/composables/use-exploration.test.ts
git commit -m "feat: add fetchNeighbors method to TileService"
```

---

### Task 4: Exploration Composable

**Files:**
- Create: `src/composables/use-exploration.ts`
- Modify: `tests/unit/composables/use-exploration.test.ts` (add composable tests)

This composable orchestrates neighbor expansion: calls the API, merges results into the topology graph, updates the exploration store, and pins expanded nodes.

- [ ] **Step 1: Add composable tests to the existing test file**

Append to `tests/unit/composables/use-exploration.test.ts`:

```typescript
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach } from 'vitest'
import { useExplorationStore } from '@/stores/exploration'
import { useTopologyStore } from '@/stores/topology'

describe('useExploration (store integration)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    server.listen({ onUnhandledRequest: 'bypass' })
  })

  it('expandNeighbors merges elements into topology graph', async () => {
    const { expandNeighbors } = await import('@/composables/use-exploration')
    const topologyStore = useTopologyStore()
    const explorationStore = useExplorationStore()

    // Seed the source node so it exists in the graph
    topologyStore.graph.addNode('el-0', {
      id: 'el-0', type: 'router', label: 'Router 0',
      lng: 0, lat: 0, version: 1, updatedAt: '', properties: {},
    })

    await expandNeighbors('el-0', 'Router 0')

    // Should have added neighbor nodes to graph
    expect(topologyStore.graph.order).toBeGreaterThan(1)
    // Should have added breadcrumb
    expect(explorationStore.breadcrumbs.length).toBeGreaterThanOrEqual(1)
    // Should track expanded node IDs
    expect(explorationStore.expandedNodeIds.size).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/composables/use-exploration.test.ts`
Expected: FAIL — module `@/composables/use-exploration` not found

- [ ] **Step 3: Implement the exploration composable**

Create `src/composables/use-exploration.ts`:

```typescript
import { useTopologyStore } from '@/stores/topology'
import { useExplorationStore } from '@/stores/exploration'
import { usePerformanceStore } from '@/stores/performance'
import { TileService } from '@/api/tile-service'
import { telemetry } from '@/utils/telemetry'

const tileService = new TileService()

export async function expandNeighbors(
  elementId: string,
  elementLabel: string,
  depth: number = 1,
): Promise<void> {
  const explorationStore = useExplorationStore()
  const topologyStore = useTopologyStore()
  const performanceStore = usePerformanceStore()

  if (!explorationStore.canExpand) return

  explorationStore.setExpanding(true)
  const start = performance.now()

  try {
    const response = await tileService.fetchNeighbors(elementId, depth)

    // Add breadcrumb for this exploration step
    explorationStore.pushBreadcrumb({ id: elementId, label: elementLabel })

    // Merge neighbor elements into the graph
    const newNodeIds: string[] = []
    for (const el of response.elements) {
      if (!topologyStore.graph.hasNode(el.id)) {
        topologyStore.graph.addNode(el.id, { ...el })
        newNodeIds.push(el.id)
      } else {
        const currentVersion = topologyStore.graph.getNodeAttribute(el.id, 'version') as number
        if (el.version > currentVersion) {
          topologyStore.graph.replaceNodeAttributes(el.id, { ...el })
        }
      }
    }

    // Merge neighbor links into the graph
    for (const link of response.links) {
      if (!topologyStore.graph.hasNode(link.sourceId) || !topologyStore.graph.hasNode(link.targetId)) {
        continue
      }
      if (topologyStore.graph.hasEdge(link.id)) {
        const currentVersion = topologyStore.graph.getEdgeAttribute(link.id, 'version') as number
        if (link.version > currentVersion) {
          topologyStore.graph.replaceEdgeAttributes(link.id, { ...link })
        }
      } else {
        if (link.directed) {
          topologyStore.graph.addDirectedEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link })
        } else {
          topologyStore.graph.addUndirectedEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link })
        }
      }
    }

    // Track expanded nodes and pin them
    explorationStore.addExpandedNodes(newNodeIds)
    if (newNodeIds.length > 0) {
      performanceStore.pinNodes(newNodeIds)
    }

    telemetry.emit('neighbor_expand_ms', performance.now() - start)
    telemetry.emit('neighbor_expand_count', response.elements.length)
  } finally {
    explorationStore.setExpanding(false)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/composables/use-exploration.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/use-exploration.ts tests/unit/composables/use-exploration.test.ts
git commit -m "feat: add exploration composable for neighbor expansion"
```

---

### Task 5: Breadcrumb Trail Component

**Files:**
- Create: `src/components/BreadcrumbTrail.vue`
- Modify: `src/components/SidePanel.vue`

Add a breadcrumb trail UI that shows the exploration path and allows navigating back.

- [ ] **Step 1: Create BreadcrumbTrail component**

Create `src/components/BreadcrumbTrail.vue`:

```vue
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
  flyTo: [element: { id: string; lng: number; lat: number }]
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
```

- [ ] **Step 2: Add exploration UI to SidePanel**

In `src/components/SidePanel.vue`, make these changes:

**Add imports** (in `<script setup>` block, after existing imports):

```typescript
import BreadcrumbTrail from '@/components/BreadcrumbTrail.vue'
import { useExplorationStore } from '@/stores/exploration'
import { expandNeighbors } from '@/composables/use-exploration'

const explorationStore = useExplorationStore()
```

**Add "Expand Neighbors" button** inside the detail panel section (after the properties `</div>`, before the closing `</div>` of `panel-section`):

```vue
<div class="exploration-actions">
  <button
    class="expand-btn"
    :disabled="!explorationStore.canExpand || explorationStore.isExpanding"
    @click="onExpandNeighbors"
  >
    {{ explorationStore.isExpanding ? 'Expanding...' : 'Expand Neighbors' }}
  </button>
  <span v-if="!explorationStore.canExpand" class="limit-warning">
    Neighbor limit reached — zoom in or clear exploration
  </span>
</div>
```

**Add BreadcrumbTrail** above the panel tabs (before `<div v-if="isOpen" class="panel-tabs">`):

```vue
<BreadcrumbTrail @navigate="onBreadcrumbNavigate" />
```

**Add handler functions** in the script section:

```typescript
function onExpandNeighbors() {
  if (!element.value) return
  expandNeighbors(element.value.id, element.value.label)
}

function onBreadcrumbNavigate(id: string) {
  selectionStore.selectElement(id)
}
```

**Add styles** for the new elements:

```css
.exploration-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.expand-btn {
  padding: 6px 12px;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 4px;
  color: #cdd6f4;
  font-size: 13px;
  cursor: pointer;
}

.expand-btn:hover:not(:disabled) {
  background: #45475a;
}

.expand-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.limit-warning {
  color: #f9e2af;
  font-size: 11px;
}
```

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/BreadcrumbTrail.vue src/components/SidePanel.vue
git commit -m "feat: add breadcrumb trail and expand neighbors UI in side panel"
```

---

### Task 6: Keyboard Shortcuts Composable

**Files:**
- Create: `src/composables/use-keyboard-shortcuts.ts`
- Create: `tests/unit/composables/use-keyboard-shortcuts.test.ts`

Keyboard shortcuts to implement (from design spec + standard UX):
- `Escape` — clear selection
- `/` — focus search input
- `Tab` — toggle geo/schematic view
- `?` — toggle keyboard help overlay
- `Backspace` — navigate back in breadcrumb trail

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/composables/use-keyboard-shortcuts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  type ShortcutDefinition,
  matchesShortcut,
  buildShortcutRegistry,
} from '@/composables/use-keyboard-shortcuts'

describe('matchesShortcut', () => {
  function fakeEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      key: '',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as KeyboardEvent
  }

  it('matches simple key', () => {
    const shortcut: ShortcutDefinition = { key: 'Escape', label: 'Clear', handler: vi.fn() }
    expect(matchesShortcut(fakeEvent({ key: 'Escape' }), shortcut)).toBe(true)
  })

  it('rejects wrong key', () => {
    const shortcut: ShortcutDefinition = { key: 'Escape', label: 'Clear', handler: vi.fn() }
    expect(matchesShortcut(fakeEvent({ key: 'Enter' }), shortcut)).toBe(false)
  })

  it('matches key with ctrl modifier', () => {
    const shortcut: ShortcutDefinition = { key: 'k', ctrl: true, label: 'Search', handler: vi.fn() }
    expect(matchesShortcut(fakeEvent({ key: 'k', ctrlKey: true }), shortcut)).toBe(true)
    expect(matchesShortcut(fakeEvent({ key: 'k', metaKey: true }), shortcut)).toBe(true)
  })

  it('rejects ctrl shortcut without modifier', () => {
    const shortcut: ShortcutDefinition = { key: 'k', ctrl: true, label: 'Search', handler: vi.fn() }
    expect(matchesShortcut(fakeEvent({ key: 'k' }), shortcut)).toBe(false)
  })
})

describe('buildShortcutRegistry', () => {
  it('builds a registry from definitions', () => {
    const defs: ShortcutDefinition[] = [
      { key: 'Escape', label: 'Clear selection', handler: vi.fn() },
      { key: '/', label: 'Focus search', handler: vi.fn() },
    ]
    const registry = buildShortcutRegistry(defs)
    expect(registry).toHaveLength(2)
    expect(registry[0].label).toBe('Clear selection')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/composables/use-keyboard-shortcuts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the keyboard shortcuts composable**

Create `src/composables/use-keyboard-shortcuts.ts`:

```typescript
import { onMounted, onUnmounted, ref } from 'vue'
import { telemetry } from '@/utils/telemetry'

export interface ShortcutDefinition {
  key: string
  ctrl?: boolean
  shift?: boolean
  label: string
  handler: () => void
}

export function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutDefinition): boolean {
  if (event.key !== shortcut.key) return false
  if (shortcut.ctrl && !(event.ctrlKey || event.metaKey)) return false
  if (!shortcut.ctrl && (event.ctrlKey || event.metaKey)) return false
  if (shortcut.shift && !event.shiftKey) return false
  if (!shortcut.shift && event.shiftKey) return false
  return true
}

export function buildShortcutRegistry(definitions: ShortcutDefinition[]): ShortcutDefinition[] {
  return [...definitions]
}

export function useKeyboardShortcuts(definitions: ShortcutDefinition[]) {
  const showHelp = ref(false)
  const registry = buildShortcutRegistry(definitions)

  function handleKeydown(event: KeyboardEvent) {
    // Ignore shortcuts when typing in input/textarea
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow Escape to blur inputs
      if (event.key === 'Escape') {
        target.blur()
        return
      }
      return
    }

    for (const shortcut of registry) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault()
        shortcut.handler()
        telemetry.emit('keyboard_shortcut', 1)
        return
      }
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return { showHelp, registry }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/composables/use-keyboard-shortcuts.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/use-keyboard-shortcuts.ts tests/unit/composables/use-keyboard-shortcuts.test.ts
git commit -m "feat: add keyboard shortcuts composable with shortcut matching"
```

---

### Task 7: Keyboard Help Overlay and Wiring

**Files:**
- Create: `src/components/KeyboardHelpOverlay.vue`
- Modify: `src/views/TopologyView.vue`

Wire shortcuts into the app and add the help overlay.

- [ ] **Step 1: Create KeyboardHelpOverlay component**

Create `src/components/KeyboardHelpOverlay.vue`:

```vue
<template>
  <Teleport to="body">
    <div v-if="visible" class="help-overlay" @click.self="$emit('close')">
      <div class="help-dialog">
        <div class="help-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="help-close" @click="$emit('close')">&times;</button>
        </div>
        <table class="help-table">
          <tbody>
            <tr v-for="shortcut in shortcuts" :key="shortcut.key">
              <td class="help-key">
                <kbd v-if="shortcut.ctrl">Ctrl+</kbd>
                <kbd v-if="shortcut.shift">Shift+</kbd>
                <kbd>{{ displayKey(shortcut.key) }}</kbd>
              </td>
              <td class="help-desc">{{ shortcut.label }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ShortcutDefinition } from '@/composables/use-keyboard-shortcuts'

defineProps<{
  visible: boolean
  shortcuts: ShortcutDefinition[]
}>()

defineEmits<{
  close: []
}>()

function displayKey(key: string): string {
  const map: Record<string, string> = {
    Escape: 'Esc',
    Backspace: '\u232B',
    Tab: 'Tab',
    '/': '/',
    '?': '?',
  }
  return map[key] ?? key
}
</script>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.help-dialog {
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  max-width: 480px;
  color: #cdd6f4;
}

.help-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.help-header h3 {
  margin: 0;
  font-size: 16px;
}

.help-close {
  background: none;
  border: none;
  color: #cdd6f4;
  font-size: 20px;
  cursor: pointer;
}

.help-table {
  width: 100%;
  border-collapse: collapse;
}

.help-table tr {
  border-bottom: 1px solid #313244;
}

.help-table td {
  padding: 8px 4px;
  font-size: 13px;
}

.help-key {
  white-space: nowrap;
  width: 100px;
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}

.help-desc {
  color: #a6adc8;
}
</style>
```

- [ ] **Step 2: Wire shortcuts into TopologyView**

Replace the `<script setup>` block in `src/views/TopologyView.vue` with:

```typescript
import { ref } from 'vue'
import TopToolbar from '@/components/TopToolbar.vue'
import MapView from '@/components/MapView.vue'
import SchematicView from '@/components/SchematicView.vue'
import SidePanel from '@/components/SidePanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import KeyboardHelpOverlay from '@/components/KeyboardHelpOverlay.vue'
import { useViewModeStore } from '@/stores/view-mode'
import { useSelectionStore } from '@/stores/selection'
import { useExplorationStore } from '@/stores/exploration'
import { useKeyboardShortcuts } from '@/composables/use-keyboard-shortcuts'
import type { NetworkElement } from '@/types/topology'

const viewModeStore = useViewModeStore()
const selectionStore = useSelectionStore()
const explorationStore = useExplorationStore()
const mapViewRef = ref<InstanceType<typeof MapView> | null>(null)

const { showHelp, registry } = useKeyboardShortcuts([
  {
    key: 'Escape',
    label: 'Clear selection',
    handler: () => {
      selectionStore.clearSelection()
      showHelp.value = false
    },
  },
  {
    key: '/',
    label: 'Focus search',
    handler: () => {
      const input = document.querySelector<HTMLInputElement>('.search-input input')
      input?.focus()
    },
  },
  {
    key: 'Tab',
    label: 'Toggle geo/schematic view',
    handler: () => viewModeStore.toggle(),
  },
  {
    key: '?',
    shift: true,
    label: 'Show keyboard shortcuts',
    handler: () => { showHelp.value = !showHelp.value },
  },
  {
    key: 'Backspace',
    label: 'Navigate back in breadcrumb trail',
    handler: () => {
      if (explorationStore.breadcrumbs.length > 1) {
        explorationStore.navigateTo(explorationStore.breadcrumbs.length - 2)
        const prev = explorationStore.breadcrumbs[explorationStore.breadcrumbs.length - 1]
        if (prev) selectionStore.selectElement(prev.id)
      }
    },
  },
])

function onElementClick(id: string) {
  // Selection is handled inside views via the selection store
}

function onElementHover(id: string | null) {
  // Future: tooltip rendering
}

function onFlyTo(element: NetworkElement) {
  if (viewModeStore.isSchematic) {
    viewModeStore.setMode('geo')
  }
  setTimeout(() => {
    mapViewRef.value?.flyTo(element.lng, element.lat)
  }, 50)
}
```

Update the template to add the help overlay (before closing `</div>` of `topology-view`):

```vue
<KeyboardHelpOverlay
  :visible="showHelp"
  :shortcuts="registry"
  @close="showHelp = false"
/>
```

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/KeyboardHelpOverlay.vue src/views/TopologyView.vue
git commit -m "feat: wire keyboard shortcuts and add help overlay"
```

---

### Task 8: Telemetry Instrumentation

**Files:**
- Modify: `src/composables/use-search.ts`
- Modify: `src/composables/use-deck-layers.ts`
- Modify: `src/views/TopologyView.vue`

Add telemetry to existing code paths for the events specified in the design spec that aren't yet instrumented: `search_ms`, `visible_element_count`, `worker_layout_ms`, and interaction events.

- [ ] **Step 1: Add search_ms telemetry**

In `src/composables/use-search.ts`, modify the `search` function inside `useSearchStore` (around line 30). Add `import { telemetry } from '@/utils/telemetry'` at the top of the file (after line 3), then wrap the search call:

```typescript
async function search(query: string) {
  abortController?.abort()
  abortController = new AbortController()

  if (!query.trim()) {
    results.value = []
    total.value = 0
    isSearching.value = false
    return
  }

  isSearching.value = true
  const start = performance.now()
  try {
    const response = await performSearch(query, 20, abortController.signal)
    results.value = response.results
    total.value = response.total
    telemetry.emit('search_ms', performance.now() - start)
  } catch {
    // Aborted or failed — ignore
  } finally {
    isSearching.value = false
  }
}
```

- [ ] **Step 2: Add layer rebuild telemetry**

In `src/composables/use-deck-layers.ts`, add `import { telemetry } from '@/utils/telemetry'` at the top (after line 7). Then wrap the `layers` computed getter body:

At the start of the `layers` computed callback (line 65, after `const allLayers: any[] = []`):

```typescript
const layerBuildStart = performance.now()
```

At the end, just before `return allLayers` (before line 152):

```typescript
telemetry.emit('layer_rebuild_ms', performance.now() - layerBuildStart)
```

- [ ] **Step 3: Add flyTo telemetry**

In `src/views/TopologyView.vue`, add `import { telemetry } from '@/utils/telemetry'` and add a telemetry call in `onFlyTo`:

```typescript
function onFlyTo(element: NetworkElement) {
  telemetry.emit('fly_to', 1)
  if (viewModeStore.isSchematic) {
    viewModeStore.setMode('geo')
  }
  setTimeout(() => {
    mapViewRef.value?.flyTo(element.lng, element.lat)
  }, 50)
}
```

- [ ] **Step 4: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/composables/use-search.ts src/composables/use-deck-layers.ts src/views/TopologyView.vue
git commit -m "feat: add telemetry instrumentation for search, layer rebuild, and fly-to"
```

---

### Task 9: Integration Smoke Test

**Files:**
- Modify: `tests/unit/stores/exploration.test.ts` (add edge case tests)

Add a few edge-case tests to ensure the exploration system handles boundary conditions.

- [ ] **Step 1: Add edge case tests**

Append to `tests/unit/stores/exploration.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/stores/exploration.test.ts
git commit -m "test: add exploration store edge case tests"
```
