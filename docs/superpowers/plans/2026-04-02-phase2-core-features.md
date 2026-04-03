# Phase 2: Core Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add schematic view with d3-force layout in Web Worker, view toggle, LOD clustering, search & filter, multi-select with drag-box, and drag reposition in schematic view.

**Architecture:** The schematic view uses Deck.gl's `OrthographicView` with node positions computed by a d3-force Web Worker. A `view-mode` Pinia store tracks `'geo' | 'schematic'` and the composables branch on it. Clustering is handled by the mock backend returning `TopologyCluster` objects at low zoom; the frontend renders them as sized circles. Search/filter use a new `filter` store and toolbar UI. Multi-select adds Ctrl+click (already in selection store) and drag-box select. Drag reposition updates layout positions in schematic view only.

**Tech Stack:** Vue 3, TypeScript, Vite, Deck.gl, d3-force (new dep), Graphology, Pinia, msw, Vitest

---

## File Structure

```
src/
  stores/
    view-mode.ts              # NEW — 'geo' | 'schematic' toggle state
    filter.ts                 # NEW — active type/property filters, search query
    topology.ts               # MODIFY — add cluster support, getCluster(), getClusters()
  workers/
    layout-worker.ts          # NEW — d3-force layout in Web Worker (plain TS)
  composables/
    use-force-layout.ts       # NEW — Web Worker bridge, sends graph data, receives positions
    use-deck-layers.ts        # MODIFY — add cluster layer, schematic position branch, drag handlers
    use-search.ts             # NEW — debounced search composable
  components/
    MapView.vue               # MODIFY — conditional Mapbox vs OrthographicView based on view mode
    SchematicView.vue          # NEW — Deck.gl OrthographicView with force layout positions
    TopToolbar.vue             # MODIFY — add view toggle button, search input, filter chips
    SearchInput.vue            # NEW — debounced search input with results dropdown
    FilterPanel.vue            # NEW — type filter checkboxes, property filter dropdowns
    SidePanel.vue              # MODIFY — add search results mode, filter controls mode
    StatusBar.vue              # MODIFY — show view mode indicator
  views/
    TopologyView.vue           # MODIFY — switch MapView/SchematicView based on view mode
  mock/
    handlers.ts               # MODIFY — clustering at low zoom, filter params
    data-generator.ts          # MODIFY — add cluster generation
  types/
    topology.ts               # MODIFY — add LayoutPosition type, FilterCriteria type
tests/unit/
    stores/view-mode.test.ts   # NEW
    stores/filter.test.ts      # NEW
    workers/layout-worker.test.ts # NEW
    composables/use-force-layout.test.ts # NEW
    composables/use-search.test.ts # NEW
    mock/clustering.test.ts    # NEW
```

---

## Task 1: Install d3-force dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install d3-force and its types**

```bash
npm install d3-force && npm install -D @types/d3-force
```

- [ ] **Step 2: Verify installation**

```bash
npx vitest run
```

Expected: All 38 existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add d3-force dependency for schematic layout"
```

---

## Task 2: View Mode Store

**Files:**
- Create: `src/stores/view-mode.ts`
- Test: `tests/unit/stores/view-mode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/stores/view-mode.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useViewModeStore } from '@/stores/view-mode'

describe('useViewModeStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults to geo mode', () => {
    const store = useViewModeStore()
    expect(store.mode).toBe('geo')
  })

  it('toggles to schematic', () => {
    const store = useViewModeStore()
    store.setMode('schematic')
    expect(store.mode).toBe('schematic')
  })

  it('toggles back to geo', () => {
    const store = useViewModeStore()
    store.setMode('schematic')
    store.setMode('geo')
    expect(store.mode).toBe('geo')
  })

  it('toggle() flips between modes', () => {
    const store = useViewModeStore()
    expect(store.mode).toBe('geo')
    store.toggle()
    expect(store.mode).toBe('schematic')
    store.toggle()
    expect(store.mode).toBe('geo')
  })

  it('isSchematic computed is reactive', () => {
    const store = useViewModeStore()
    expect(store.isSchematic).toBe(false)
    store.setMode('schematic')
    expect(store.isSchematic).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/stores/view-mode.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/stores/view-mode.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/view-mode.ts tests/unit/stores/view-mode.test.ts
git commit -m "feat: add view-mode store for geo/schematic toggle"
```

---

## Task 3: Filter Store

**Files:**
- Modify: `src/types/topology.ts` — add `FilterCriteria` type
- Create: `src/stores/filter.ts`
- Test: `tests/unit/stores/filter.test.ts`

- [ ] **Step 1: Add FilterCriteria type to topology.ts**

Add at the end of `src/types/topology.ts`:

```typescript
// --- Filter Types ---

export interface FilterCriteria {
  types: string[]               // element types to include (empty = all)
  searchQuery: string           // current search text
  propertyFilters: Record<string, string>  // key → value filter on element properties
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/stores/filter.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFilterStore } from '@/stores/filter'

describe('useFilterStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts with empty filters', () => {
    const store = useFilterStore()
    expect(store.criteria.types).toEqual([])
    expect(store.criteria.searchQuery).toBe('')
    expect(store.criteria.propertyFilters).toEqual({})
    expect(store.hasActiveFilters).toBe(false)
  })

  it('setTypeFilter sets type list', () => {
    const store = useFilterStore()
    store.setTypeFilter(['router', 'switch'])
    expect(store.criteria.types).toEqual(['router', 'switch'])
    expect(store.hasActiveFilters).toBe(true)
  })

  it('toggleType adds and removes', () => {
    const store = useFilterStore()
    store.toggleType('router')
    expect(store.criteria.types).toEqual(['router'])
    store.toggleType('switch')
    expect(store.criteria.types).toEqual(['router', 'switch'])
    store.toggleType('router')
    expect(store.criteria.types).toEqual(['switch'])
  })

  it('setSearchQuery updates query', () => {
    const store = useFilterStore()
    store.setSearchQuery('test')
    expect(store.criteria.searchQuery).toBe('test')
    expect(store.hasActiveFilters).toBe(true)
  })

  it('setPropertyFilter sets and removes', () => {
    const store = useFilterStore()
    store.setPropertyFilter('status', 'active')
    expect(store.criteria.propertyFilters).toEqual({ status: 'active' })
    expect(store.hasActiveFilters).toBe(true)
    store.removePropertyFilter('status')
    expect(store.criteria.propertyFilters).toEqual({})
  })

  it('clearAll resets everything', () => {
    const store = useFilterStore()
    store.setTypeFilter(['router'])
    store.setSearchQuery('test')
    store.setPropertyFilter('status', 'active')
    store.clearAll()
    expect(store.criteria.types).toEqual([])
    expect(store.criteria.searchQuery).toBe('')
    expect(store.criteria.propertyFilters).toEqual({})
    expect(store.hasActiveFilters).toBe(false)
  })

  it('matchesElement filters by type', () => {
    const store = useFilterStore()
    const el = { id: '1', type: 'router', label: 'r1', lng: 0, lat: 0, version: 1, updatedAt: '', properties: {} }
    expect(store.matchesElement(el)).toBe(true)
    store.setTypeFilter(['switch'])
    expect(store.matchesElement(el)).toBe(false)
    store.setTypeFilter(['router', 'switch'])
    expect(store.matchesElement(el)).toBe(true)
  })

  it('matchesElement filters by property', () => {
    const store = useFilterStore()
    const el = { id: '1', type: 'router', label: 'r1', lng: 0, lat: 0, version: 1, updatedAt: '', properties: { status: 'active' } }
    store.setPropertyFilter('status', 'active')
    expect(store.matchesElement(el)).toBe(true)
    store.setPropertyFilter('status', 'inactive')
    expect(store.matchesElement(el)).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/stores/filter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write implementation**

```typescript
// src/stores/filter.ts
import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import type { FilterCriteria, NetworkElement } from '@/types/topology'

export const useFilterStore = defineStore('filter', () => {
  const criteria = reactive<FilterCriteria>({
    types: [],
    searchQuery: '',
    propertyFilters: {},
  })

  const hasActiveFilters = computed(
    () =>
      criteria.types.length > 0 ||
      criteria.searchQuery.length > 0 ||
      Object.keys(criteria.propertyFilters).length > 0,
  )

  function setTypeFilter(types: string[]) {
    criteria.types = [...types]
  }

  function toggleType(type: string) {
    const idx = criteria.types.indexOf(type)
    if (idx >= 0) {
      criteria.types.splice(idx, 1)
    } else {
      criteria.types.push(type)
    }
  }

  function setSearchQuery(query: string) {
    criteria.searchQuery = query
  }

  function setPropertyFilter(key: string, value: string) {
    criteria.propertyFilters[key] = value
  }

  function removePropertyFilter(key: string) {
    delete criteria.propertyFilters[key]
  }

  function clearAll() {
    criteria.types = []
    criteria.searchQuery = ''
    const keys = Object.keys(criteria.propertyFilters)
    for (const k of keys) delete criteria.propertyFilters[k]
  }

  function matchesElement(el: NetworkElement): boolean {
    if (criteria.types.length > 0 && !criteria.types.includes(el.type)) {
      return false
    }
    for (const [key, value] of Object.entries(criteria.propertyFilters)) {
      if (String(el.properties[key] ?? '') !== value) return false
    }
    return true
  }

  return {
    criteria,
    hasActiveFilters,
    setTypeFilter,
    toggleType,
    setSearchQuery,
    setPropertyFilter,
    removePropertyFilter,
    clearAll,
    matchesElement,
  }
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/stores/filter.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/types/topology.ts src/stores/filter.ts tests/unit/stores/filter.test.ts
git commit -m "feat: add filter store with type, property, and search criteria"
```

---

## Task 4: Cluster Support in Topology Store & Mock API

**Files:**
- Modify: `src/stores/topology.ts` — add cluster storage and retrieval
- Modify: `src/mock/data-generator.ts` — add `generateClusters()`
- Modify: `src/mock/handlers.ts` — return clusters at low zoom
- Test: `tests/unit/mock/clustering.test.ts`

- [ ] **Step 1: Add cluster support to topology store**

In `src/stores/topology.ts`, add after the `edgeTileRefs` ref:

```typescript
import type {
  NetworkElement,
  TopologyLink,
  TopologyCluster,
  TileElementsResponse,
  TileLinksResponse,
} from '@/types/topology'

// Inside the store function, add:
const clusters = ref(new Map<string, TopologyCluster>())
const clusterTileRefs = ref(new Map<string, Set<string>>())
```

Update `mergeTileElements` to handle clusters:

```typescript
function mergeTileElements(tileKey: string, response: TileElementsResponse) {
  tileGenerations.value.set(tileKey, response.generation)

  for (const id of response.removedIds) {
    if (graph.value.hasNode(id)) {
      graph.value.dropNode(id)
    }
    nodeTileRefs.value.delete(id)
  }

  for (const el of response.elements) {
    if (graph.value.hasNode(el.id)) {
      const currentVersion = graph.value.getNodeAttribute(el.id, 'version') as number
      if (el.version > currentVersion) {
        graph.value.replaceNodeAttributes(el.id, { ...el })
      }
    } else {
      graph.value.addNode(el.id, { ...el })
    }

    if (!nodeTileRefs.value.has(el.id)) {
      nodeTileRefs.value.set(el.id, new Set())
    }
    nodeTileRefs.value.get(el.id)!.add(tileKey)
  }

  // Handle clusters from the response
  for (const cluster of response.clusters) {
    clusters.value.set(cluster.id, cluster)
    if (!clusterTileRefs.value.has(cluster.id)) {
      clusterTileRefs.value.set(cluster.id, new Set())
    }
    clusterTileRefs.value.get(cluster.id)!.add(tileKey)
  }
}
```

Update `evictTile` to handle clusters:

```typescript
function evictTile(tileKey: string) {
  tileGenerations.value.delete(tileKey)

  for (const [edgeId, tiles] of edgeTileRefs.value) {
    tiles.delete(tileKey)
    if (tiles.size === 0) {
      if (graph.value.hasEdge(edgeId)) {
        graph.value.dropEdge(edgeId)
      }
      edgeTileRefs.value.delete(edgeId)
    }
  }

  for (const [nodeId, tiles] of nodeTileRefs.value) {
    tiles.delete(tileKey)
    if (tiles.size === 0) {
      if (graph.value.hasNode(nodeId)) {
        graph.value.dropNode(nodeId)
      }
      nodeTileRefs.value.delete(nodeId)
    }
  }

  // Evict clusters with no remaining tile refs
  for (const [clusterId, tiles] of clusterTileRefs.value) {
    tiles.delete(tileKey)
    if (tiles.size === 0) {
      clusters.value.delete(clusterId)
      clusterTileRefs.value.delete(clusterId)
    }
  }
}
```

Add cluster accessors:

```typescript
function getCluster(id: string): TopologyCluster | null {
  return clusters.value.get(id) ?? null
}

function getClusters(): TopologyCluster[] {
  return [...clusters.value.values()]
}

const clusterCount = computed(() => clusters.value.size)
```

Update `clear()` to clear clusters:

```typescript
function clear() {
  graph.value.clear()
  nodeTileRefs.value.clear()
  edgeTileRefs.value.clear()
  tileGenerations.value.clear()
  clusters.value.clear()
  clusterTileRefs.value.clear()
}
```

Add to the return:

```typescript
return {
  graph, nodeTileRefs, edgeTileRefs, tileGenerations,
  clusters, clusterTileRefs,
  nodeCount, edgeCount, clusterCount,
  mergeTileElements, mergeTileLinks, evictTile, getElement, getCluster, getClusters, clear,
}
```

- [ ] **Step 2: Add cluster generation to data-generator.ts**

Add at the end of `src/mock/data-generator.ts`:

```typescript
import type { NetworkElement, TopologyLink, TopologyCluster } from '@/types/topology'

// Replace the existing import and add this function:

export function generateClustersForTile(
  elements: NetworkElement[],
  z: number,
  x: number,
  y: number,
): TopologyCluster[] {
  if (elements.length === 0) return []

  // Simple grid-based clustering: divide tile into 4 quadrants
  const { west, south, east, north } = tileToBBox(z, x, y)
  const midLng = (west + east) / 2
  const midLat = (south + north) / 2

  const quadrants: NetworkElement[][] = [[], [], [], []]
  for (const el of elements) {
    const qi = (el.lng >= midLng ? 1 : 0) + (el.lat >= midLat ? 2 : 0)
    quadrants[qi]!.push(el)
  }

  const clusters: TopologyCluster[] = []
  const lngs = [
    (west + midLng) / 2,
    (midLng + east) / 2,
    (west + midLng) / 2,
    (midLng + east) / 2,
  ]
  const lats = [
    (south + midLat) / 2,
    (south + midLat) / 2,
    (midLat + north) / 2,
    (midLat + north) / 2,
  ]

  for (let qi = 0; qi < 4; qi++) {
    const group = quadrants[qi]!
    if (group.length === 0) continue
    const types: Record<string, number> = {}
    for (const el of group) {
      types[el.type] = (types[el.type] ?? 0) + 1
    }
    clusters.push({
      id: `cluster-${z}-${x}-${y}-q${qi}`,
      centroidLng: lngs[qi]!,
      centroidLat: lats[qi]!,
      count: group.length,
      childIds: group.map((el) => el.id),
      elementTypes: types,
    })
  }
  return clusters
}
```

- [ ] **Step 3: Update mock handlers to return clusters at low zoom**

In `src/mock/handlers.ts`, update the elements handler:

```typescript
import {
  generateElements,
  generateLinks,
  elementsInTile,
  generateClustersForTile,
  resetSeed,
} from './data-generator'

// In the elements handler, replace the response construction:
http.get('/api/topology/tiles/:z/:x/:y/elements', ({ params }) => {
  const z = Number(params.z)
  const x = Number(params.x)
  const y = Number(params.y)
  const elements = elementsInTile(ALL_ELEMENTS, z, x, y)

  // At low zoom (< 12), return clusters instead of individual elements
  const CLUSTER_ZOOM_THRESHOLD = 12
  if (z < CLUSTER_ZOOM_THRESHOLD && elements.length > 10) {
    const clusters = generateClustersForTile(elements, z, x, y)
    const response: TileElementsResponse = {
      elements: [],
      clusters,
      generation: 1,
      removedIds: [],
    }
    return HttpResponse.json(response)
  }

  const response: TileElementsResponse = {
    elements,
    clusters: [],
    generation: 1,
    removedIds: [],
  }
  return HttpResponse.json(response)
}),
```

- [ ] **Step 4: Write clustering test**

```typescript
// tests/unit/mock/clustering.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { generateElements, elementsInTile, generateClustersForTile, resetSeed } from '@/mock/data-generator'

describe('generateClustersForTile', () => {
  beforeEach(() => resetSeed(42))

  it('returns empty array for no elements', () => {
    const clusters = generateClustersForTile([], 5, 0, 0)
    expect(clusters).toEqual([])
  })

  it('generates clusters with correct structure', () => {
    const elements = generateElements(500)
    const tileElements = elementsInTile(elements, 3, 4, 3)
    if (tileElements.length === 0) return // tile may be empty with seeded data

    const clusters = generateClustersForTile(tileElements, 3, 4, 3)
    for (const cluster of clusters) {
      expect(cluster.id).toMatch(/^cluster-3-4-3-q\d$/)
      expect(cluster.count).toBeGreaterThan(0)
      expect(typeof cluster.centroidLng).toBe('number')
      expect(typeof cluster.centroidLat).toBe('number')
      expect(cluster.childIds).toBeDefined()
      expect(cluster.childIds!.length).toBe(cluster.count)
      expect(Object.values(cluster.elementTypes).reduce((a, b) => a + b, 0)).toBe(cluster.count)
    }
  })

  it('cluster child counts sum to total elements', () => {
    const elements = generateElements(500)
    const tileElements = elementsInTile(elements, 3, 4, 3)
    if (tileElements.length === 0) return

    const clusters = generateClustersForTile(tileElements, 3, 4, 3)
    const totalCount = clusters.reduce((sum, c) => sum + c.count, 0)
    expect(totalCount).toBe(tileElements.length)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/mock/clustering.test.ts tests/unit/stores/topology.test.ts`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/stores/topology.ts src/mock/data-generator.ts src/mock/handlers.ts src/types/topology.ts tests/unit/mock/clustering.test.ts
git commit -m "feat: add LOD clustering support in mock API and topology store"
```

---

## Task 5: Force Layout Web Worker

**Files:**
- Create: `src/workers/layout-worker.ts`
- Test: `tests/unit/workers/layout-worker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/workers/layout-worker.test.ts
import { describe, it, expect } from 'vitest'
import { computeLayout, type LayoutInput, type LayoutOutput } from '@/workers/layout-worker'

describe('computeLayout', () => {
  it('returns positions for all nodes', () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
        { id: 'c', x: 0, y: 100 },
      ],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
      iterations: 50,
    }

    const output = computeLayout(input)
    expect(output.positions).toHaveLength(3)
    expect(output.positions.map((p) => p.id).sort()).toEqual(['a', 'b', 'c'])
    for (const pos of output.positions) {
      expect(typeof pos.x).toBe('number')
      expect(typeof pos.y).toBe('number')
      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    }
  })

  it('connected nodes are closer than unconnected', () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 500, y: 500 },
        { id: 'c', x: -500, y: -500 },
      ],
      edges: [{ source: 'a', target: 'b' }],
      iterations: 300,
    }

    const output = computeLayout(input)
    const pos = Object.fromEntries(output.positions.map((p) => [p.id, p]))
    const distAB = Math.hypot(pos.a!.x - pos.b!.x, pos.a!.y - pos.b!.y)
    const distAC = Math.hypot(pos.a!.x - pos.c!.x, pos.a!.y - pos.c!.y)
    expect(distAB).toBeLessThan(distAC)
  })

  it('handles empty input', () => {
    const output = computeLayout({ nodes: [], edges: [], iterations: 10 })
    expect(output.positions).toEqual([])
  })

  it('handles nodes with no edges', () => {
    const input: LayoutInput = {
      nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 100 }],
      edges: [],
      iterations: 50,
    }
    const output = computeLayout(input)
    expect(output.positions).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/workers/layout-worker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/workers/layout-worker.ts
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum } from 'd3-force'

export interface LayoutNode {
  id: string
  x: number
  y: number
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface LayoutInput {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  iterations: number
}

export interface LayoutPosition {
  id: string
  x: number
  y: number
}

export interface LayoutOutput {
  positions: LayoutPosition[]
}

interface SimNode extends SimulationNodeDatum {
  id: string
}

export function computeLayout(input: LayoutInput): LayoutOutput {
  if (input.nodes.length === 0) return { positions: [] }

  const simNodes: SimNode[] = input.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
  }))

  const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]))
  const simLinks = input.edges
    .filter((e) => nodeIndex.has(e.source) && nodeIndex.has(e.target))
    .map((e) => ({ source: nodeIndex.get(e.source)!, target: nodeIndex.get(e.target)! }))

  const simulation = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).distance(80).strength(0.5))
    .force('charge', forceManyBody().strength(-120))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(15))
    .stop()

  simulation.tick(input.iterations)

  const positions: LayoutPosition[] = simNodes.map((n) => ({
    id: n.id,
    x: n.x!,
    y: n.y!,
  }))

  return { positions }
}

// Web Worker message handler — only runs in worker context
if (typeof self !== 'undefined' && typeof (self as any).WorkerGlobalScope !== 'undefined') {
  self.onmessage = (event: MessageEvent<LayoutInput>) => {
    const result = computeLayout(event.data)
    self.postMessage(result)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/workers/layout-worker.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/workers/layout-worker.ts tests/unit/workers/layout-worker.test.ts
git commit -m "feat: add d3-force layout computation with Web Worker support"
```

---

## Task 6: Force Layout Composable (Web Worker Bridge)

**Files:**
- Create: `src/composables/use-force-layout.ts`
- Test: `tests/unit/composables/use-force-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/composables/use-force-layout.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import { extractLayoutInput } from '@/composables/use-force-layout'

describe('extractLayoutInput', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('extracts nodes and edges from topology graph', () => {
    const store = useTopologyStore()
    store.mergeTileElements('t1', {
      elements: [
        { id: 'a', type: 'router', label: 'A', lng: 10, lat: 20, version: 1, updatedAt: '', properties: {} },
        { id: 'b', type: 'switch', label: 'B', lng: 30, lat: 40, version: 1, updatedAt: '', properties: {} },
      ],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    store.mergeTileLinks('t1', {
      links: [{ id: 'e1', type: 'conn', sourceId: 'a', targetId: 'b', directed: false, version: 1, updatedAt: '', properties: {} }],
      stubs: [],
      generation: 1,
      removedLinkIds: [],
    })

    const input = extractLayoutInput(store)
    expect(input.nodes).toHaveLength(2)
    expect(input.edges).toHaveLength(1)
    expect(input.nodes.find((n) => n.id === 'a')).toBeDefined()
    expect(input.edges[0]!.source).toBe('a')
    expect(input.edges[0]!.target).toBe('b')
  })

  it('excludes stub nodes', () => {
    const store = useTopologyStore()
    store.mergeTileElements('t1', {
      elements: [
        { id: 'a', type: 'router', label: 'A', lng: 10, lat: 20, version: 1, updatedAt: '', properties: {} },
      ],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    store.mergeTileLinks('t1', {
      links: [{ id: 'e1', type: 'conn', sourceId: 'a', targetId: 'b', directed: false, version: 1, updatedAt: '', properties: {} }],
      stubs: [{ id: 'b', lng: 50, lat: 60 }],
      generation: 1,
      removedLinkIds: [],
    })

    const input = extractLayoutInput(store)
    // Stubs are excluded from layout
    expect(input.nodes).toHaveLength(1)
    expect(input.nodes[0]!.id).toBe('a')
  })

  it('returns empty for empty graph', () => {
    const store = useTopologyStore()
    const input = extractLayoutInput(store)
    expect(input.nodes).toEqual([])
    expect(input.edges).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/composables/use-force-layout.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/composables/use-force-layout.ts
import { ref, watch, type Ref } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useViewModeStore } from '@/stores/view-mode'
import { computeLayout, type LayoutInput, type LayoutPosition } from '@/workers/layout-worker'

export function extractLayoutInput(topologyStore: ReturnType<typeof useTopologyStore>): LayoutInput {
  const nodes: LayoutInput['nodes'] = []
  const edges: LayoutInput['edges'] = []

  topologyStore.graph.forEachNode((id, attrs) => {
    if ((attrs as any).isStub) return
    nodes.push({ id, x: (attrs as any).lng ?? 0, y: (attrs as any).lat ?? 0 })
  })

  const nodeIds = new Set(nodes.map((n) => n.id))

  topologyStore.graph.forEachEdge((_id, _attrs, source, target) => {
    if (nodeIds.has(source) && nodeIds.has(target)) {
      edges.push({ source, target })
    }
  })

  return { nodes, edges, iterations: 300 }
}

export function useForceLayout() {
  const topologyStore = useTopologyStore()
  const viewModeStore = useViewModeStore()

  const positions = ref(new Map<string, LayoutPosition>()) as Ref<Map<string, LayoutPosition>>
  const isComputing = ref(false)

  let worker: Worker | null = null

  function runLayout() {
    if (!viewModeStore.isSchematic) return

    const input = extractLayoutInput(topologyStore)
    if (input.nodes.length === 0) {
      positions.value = new Map()
      return
    }

    isComputing.value = true

    // Use Web Worker if available, fall back to synchronous
    if (typeof Worker !== 'undefined' && !import.meta.env.TEST) {
      worker?.terminate()
      worker = new Worker(new URL('../workers/layout-worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        const result = e.data
        positions.value = new Map(result.positions.map((p: LayoutPosition) => [p.id, p]))
        isComputing.value = false
      }
      worker.postMessage(input)
    } else {
      // Synchronous fallback for tests
      const result = computeLayout(input)
      positions.value = new Map(result.positions.map((p) => [p.id, p]))
      isComputing.value = false
    }
  }

  function getPosition(id: string): LayoutPosition | undefined {
    return positions.value.get(id)
  }

  function updatePosition(id: string, x: number, y: number) {
    const pos = positions.value.get(id)
    if (pos) {
      positions.value.set(id, { ...pos, x, y })
      // Trigger reactivity
      positions.value = new Map(positions.value)
    }
  }

  function dispose() {
    worker?.terminate()
    worker = null
  }

  watch(
    () => viewModeStore.isSchematic,
    (isSchematic) => {
      if (isSchematic) runLayout()
    },
  )

  return { positions, isComputing, runLayout, getPosition, updatePosition, dispose }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/composables/use-force-layout.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/composables/use-force-layout.ts tests/unit/composables/use-force-layout.test.ts
git commit -m "feat: add force layout composable with Web Worker bridge"
```

---

## Task 7: Search Composable

**Files:**
- Create: `src/composables/use-search.ts`
- Test: `tests/unit/composables/use-search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/composables/use-search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { performSearch } from '@/composables/use-search'
import type { SearchResponse } from '@/types/topology'

// Mock apiGet
vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
}))

import { apiGet } from '@/api/client'
const mockApiGet = vi.mocked(apiGet)

describe('performSearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('calls API with query and limit', async () => {
    const mockResponse: SearchResponse = {
      results: [{ id: '1', type: 'router', label: 'router-1', lng: 0, lat: 0, version: 1, updatedAt: '', properties: {} }],
      total: 1,
    }
    mockApiGet.mockResolvedValue(mockResponse)

    const result = await performSearch('router', 20)
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/topology/search?q=router&limit=20',
      expect.any(Object),
    )
    expect(result.results).toHaveLength(1)
  })

  it('returns empty results for empty query', async () => {
    const result = await performSearch('', 20)
    expect(mockApiGet).not.toHaveBeenCalled()
    expect(result.results).toEqual([])
    expect(result.total).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/composables/use-search.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/composables/use-search.ts
import { ref, watch } from 'vue'
import { apiGet } from '@/api/client'
import { useFilterStore } from '@/stores/filter'
import type { NetworkElement, SearchResponse } from '@/types/topology'

export async function performSearch(
  query: string,
  limit: number = 20,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  if (!query.trim()) return { results: [], total: 0 }
  return apiGet<SearchResponse>(
    `/api/topology/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { signal },
  )
}

export function useSearch() {
  const filterStore = useFilterStore()

  const results = ref<NetworkElement[]>([])
  const total = ref(0)
  const isSearching = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null

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
    try {
      const response = await performSearch(query, 20, abortController.signal)
      results.value = response.results
      total.value = response.total
    } catch {
      // Aborted or failed — ignore
    } finally {
      isSearching.value = false
    }
  }

  // Watch filter store search query with 300ms debounce
  watch(
    () => filterStore.criteria.searchQuery,
    (query) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => search(query), 300)
    },
  )

  function clearResults() {
    results.value = []
    total.value = 0
  }

  return { results, total, isSearching, search, clearResults }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/composables/use-search.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/composables/use-search.ts tests/unit/composables/use-search.test.ts
git commit -m "feat: add search composable with debounced API calls"
```

---

## Task 8: Update Deck.gl Layers for Clusters and Schematic Positions

**Files:**
- Modify: `src/composables/use-deck-layers.ts`

- [ ] **Step 1: Rewrite use-deck-layers.ts to support clusters and schematic mode**

```typescript
// src/composables/use-deck-layers.ts
import { computed } from 'vue'
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useViewModeStore } from '@/stores/view-mode'
import { useFilterStore } from '@/stores/filter'
import type { NetworkElement, TopologyLink, TopologyCluster } from '@/types/topology'
import type { LayoutPosition } from '@/workers/layout-worker'

export function useDeckLayers(
  onElementClick: (id: string) => void,
  onElementHover: (id: string | null) => void,
  layoutPositions?: () => Map<string, LayoutPosition>,
) {
  const topologyStore = useTopologyStore()
  const selectionStore = useSelectionStore()
  const viewModeStore = useViewModeStore()
  const filterStore = useFilterStore()

  function getNodePosition(node: NetworkElement & { isStub?: boolean }): [number, number] {
    if (viewModeStore.isSchematic && layoutPositions) {
      const pos = layoutPositions().get(node.id)
      if (pos) return [pos.x, pos.y]
    }
    return [node.lng, node.lat]
  }

  const layers = computed(() => {
    const allLayers: any[] = []

    // Collect and filter nodes
    const nodes: (NetworkElement & { isStub?: boolean })[] = []
    topologyStore.graph.forEachNode((_id, attrs) => {
      const el = attrs as NetworkElement & { isStub?: boolean }
      if (!el.isStub && filterStore.hasActiveFilters && !filterStore.matchesElement(el)) return
      nodes.push(el)
    })

    // Collect edges
    const edges: { source: NetworkElement; target: NetworkElement; link: TopologyLink }[] = []
    topologyStore.graph.forEachEdge((_id, attrs, _source, _target, sourceAttrs, targetAttrs) => {
      edges.push({
        source: sourceAttrs as unknown as NetworkElement,
        target: targetAttrs as unknown as NetworkElement,
        link: attrs as unknown as TopologyLink,
      })
    })

    // Link layer
    allLayers.push(
      new LineLayer({
        id: 'links',
        data: edges,
        getSourcePosition: (d: { source: NetworkElement & { isStub?: boolean } }) => getNodePosition(d.source),
        getTargetPosition: (d: { target: NetworkElement & { isStub?: boolean } }) => getNodePosition(d.target),
        getColor: (d: { source: NetworkElement & { isStub?: boolean }; target: NetworkElement & { isStub?: boolean } }) => {
          if (d.source.isStub || d.target.isStub) return [150, 150, 150, 80]
          return [100, 100, 100, 160]
        },
        getWidth: 1,
        widthUnits: 'pixels' as const,
        updateTriggers: {
          getSourcePosition: [viewModeStore.mode, layoutPositions?.()],
          getTargetPosition: [viewModeStore.mode, layoutPositions?.()],
        },
      }),
    )

    // Node layer
    allLayers.push(
      new ScatterplotLayer({
        id: 'nodes',
        data: nodes,
        getPosition: (d: NetworkElement & { isStub?: boolean }) => getNodePosition(d),
        getRadius: (d: NetworkElement & { isStub?: boolean }) => (d.isStub ? 3 : 6),
        getFillColor: (d: NetworkElement & { isStub?: boolean }) => {
          if (d.isStub) return [150, 150, 150, 100]
          if (selectionStore.selectedIds.has(d.id)) return [255, 140, 0, 255]
          return [0, 128, 255, 200]
        },
        radiusUnits: 'pixels' as const,
        pickable: true,
        onClick: (info: { object?: NetworkElement }) => {
          if (info.object) onElementClick(info.object.id)
        },
        onHover: (info: { object?: NetworkElement }) => {
          onElementHover(info.object?.id ?? null)
        },
        updateTriggers: {
          getFillColor: [selectionStore.selectedIds],
          getPosition: [viewModeStore.mode, layoutPositions?.()],
        },
      }),
    )

    // Cluster layer (geo mode only, when clusters present)
    const clusters = topologyStore.getClusters()
    if (clusters.length > 0 && !viewModeStore.isSchematic) {
      allLayers.push(
        new ScatterplotLayer({
          id: 'clusters',
          data: clusters,
          getPosition: (d: TopologyCluster) => [d.centroidLng, d.centroidLat],
          getRadius: (d: TopologyCluster) => Math.min(40, 10 + Math.sqrt(d.count) * 2),
          getFillColor: [255, 200, 50, 180] as any,
          radiusUnits: 'pixels' as const,
          pickable: true,
          onClick: (info: { object?: TopologyCluster }) => {
            // Cluster click — could zoom in, for now no-op
          },
        }),
      )

      // Cluster count labels
      allLayers.push(
        new TextLayer({
          id: 'cluster-labels',
          data: clusters,
          getPosition: (d: TopologyCluster) => [d.centroidLng, d.centroidLat],
          getText: (d: TopologyCluster) => String(d.count),
          getSize: 12,
          getColor: [30, 30, 30, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          fontFamily: 'sans-serif',
          fontWeight: 700,
        }),
      )
    }

    return allLayers
  })

  return { layers }
}
```

- [ ] **Step 2: Run all existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/composables/use-deck-layers.ts
git commit -m "feat: update deck layers for cluster rendering, filters, and schematic positions"
```

---

## Task 9: SchematicView Component

**Files:**
- Create: `src/components/SchematicView.vue`

- [ ] **Step 1: Create SchematicView component**

```vue
<!-- src/components/SchematicView.vue -->
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

function handleClick(id: string) {
  if (!isDragging) {
    selectionStore.selectElement(id)
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
        return true // capture the drag
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
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass (component doesn't need unit test — it's a rendering shell)

- [ ] **Step 3: Commit**

```bash
git add src/components/SchematicView.vue
git commit -m "feat: add SchematicView component with OrthographicView and drag reposition"
```

---

## Task 10: SearchInput Component

**Files:**
- Create: `src/components/SearchInput.vue`

- [ ] **Step 1: Create SearchInput component**

```vue
<!-- src/components/SearchInput.vue -->
<template>
  <div class="search-wrapper">
    <input
      v-model="query"
      type="text"
      placeholder="Search elements..."
      class="search-input"
      @keydown.escape="clearSearch"
    />
    <button v-if="query" class="search-clear" @click="clearSearch">&times;</button>
    <div v-if="results.length > 0" class="search-results">
      <div
        v-for="el in results"
        :key="el.id"
        class="search-result-item"
        @click="$emit('selectResult', el)"
      >
        <span class="result-label">{{ el.label }}</span>
        <span class="result-type">{{ el.type }}</span>
      </div>
      <div v-if="total > results.length" class="search-more">
        {{ total - results.length }} more results...
      </div>
    </div>
    <div v-else-if="isSearching" class="search-results">
      <div class="search-loading">Searching...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { useSearch } from '@/composables/use-search'
import type { NetworkElement } from '@/types/topology'

defineEmits<{
  selectResult: [element: NetworkElement]
}>()

const filterStore = useFilterStore()
const { results, total, isSearching } = useSearch()

const query = ref(filterStore.criteria.searchQuery)

watch(query, (val) => {
  filterStore.setSearchQuery(val)
})

function clearSearch() {
  query.value = ''
  filterStore.setSearchQuery('')
}
</script>

<style scoped>
.search-wrapper {
  position: relative;
}

.search-input {
  width: 220px;
  padding: 4px 28px 4px 8px;
  border: 1px solid #45475a;
  border-radius: 4px;
  background: #1e1e2e;
  color: #cdd6f4;
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: #89b4fa;
}

.search-input::placeholder {
  color: #6c7086;
}

.search-clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #6c7086;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  width: 320px;
  max-height: 300px;
  overflow-y: auto;
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 4px;
  margin-top: 4px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.search-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}

.search-result-item:hover {
  background: #313244;
}

.result-label {
  color: #cdd6f4;
}

.result-type {
  color: #89b4fa;
  font-size: 11px;
}

.search-more,
.search-loading {
  padding: 8px 12px;
  color: #6c7086;
  font-size: 12px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SearchInput.vue
git commit -m "feat: add SearchInput component with debounced results dropdown"
```

---

## Task 11: FilterPanel Component

**Files:**
- Create: `src/components/FilterPanel.vue`

- [ ] **Step 1: Create FilterPanel component**

```vue
<!-- src/components/FilterPanel.vue -->
<template>
  <div class="filter-panel">
    <div class="filter-section">
      <h4>Element Type</h4>
      <label
        v-for="t in availableTypes"
        :key="t"
        class="filter-checkbox"
      >
        <input
          type="checkbox"
          :checked="filterStore.criteria.types.includes(t)"
          @change="filterStore.toggleType(t)"
        />
        {{ t }}
      </label>
    </div>
    <div v-if="filterStore.hasActiveFilters" class="filter-actions">
      <button class="clear-btn" @click="filterStore.clearAll">Clear all filters</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFilterStore } from '@/stores/filter'

const filterStore = useFilterStore()

const availableTypes = ['router', 'switch', 'server', 'firewall', 'access-point']
</script>

<style scoped>
.filter-panel {
  padding: 12px;
}

.filter-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #89b4fa;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 13px;
  color: #cdd6f4;
  cursor: pointer;
}

.filter-checkbox input {
  accent-color: #89b4fa;
}

.filter-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #313244;
}

.clear-btn {
  background: none;
  border: 1px solid #45475a;
  color: #cdd6f4;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.clear-btn:hover {
  background: #313244;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FilterPanel.vue
git commit -m "feat: add FilterPanel component with type filter checkboxes"
```

---

## Task 12: Update TopToolbar with View Toggle, Search, and Filter Chips

**Files:**
- Modify: `src/components/TopToolbar.vue`

- [ ] **Step 1: Rewrite TopToolbar**

```vue
<!-- src/components/TopToolbar.vue -->
<template>
  <header class="toolbar">
    <div class="toolbar-title">GIS Topology Viewer</div>
    <div class="toolbar-controls">
      <SearchInput @select-result="$emit('flyTo', $event)" />
      <button class="view-toggle" @click="viewModeStore.toggle()">
        {{ viewModeStore.isSchematic ? 'Map' : 'Schematic' }}
      </button>
    </div>
    <div class="toolbar-spacer" />
    <div v-if="filterStore.hasActiveFilters" class="filter-chips">
      <span
        v-for="t in filterStore.criteria.types"
        :key="t"
        class="chip"
      >
        {{ t }}
        <button class="chip-remove" @click="filterStore.toggleType(t)">&times;</button>
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useViewModeStore } from '@/stores/view-mode'
import { useFilterStore } from '@/stores/filter'
import SearchInput from '@/components/SearchInput.vue'
import type { NetworkElement } from '@/types/topology'

defineEmits<{
  flyTo: [element: NetworkElement]
}>()

const viewModeStore = useViewModeStore()
const filterStore = useFilterStore()
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  background: #181825;
  color: #cdd6f4;
  border-bottom: 1px solid #313244;
  z-index: 20;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-toggle {
  padding: 4px 12px;
  border: 1px solid #45475a;
  border-radius: 4px;
  background: #1e1e2e;
  color: #cdd6f4;
  font-size: 13px;
  cursor: pointer;
}

.view-toggle:hover {
  background: #313244;
}

.toolbar-spacer {
  flex: 1;
}

.filter-chips {
  display: flex;
  gap: 6px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #313244;
  border-radius: 12px;
  font-size: 12px;
  color: #cdd6f4;
}

.chip-remove {
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
}
</style>
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/components/TopToolbar.vue
git commit -m "feat: update toolbar with view toggle, search input, and filter chips"
```

---

## Task 13: Update SidePanel with Search Results and Filter Modes

**Files:**
- Modify: `src/components/SidePanel.vue`

- [ ] **Step 1: Rewrite SidePanel to support multiple modes**

```vue
<!-- src/components/SidePanel.vue -->
<template>
  <aside class="side-panel" :class="{ open: isOpen }">
    <!-- Tab header -->
    <div v-if="isOpen" class="panel-tabs">
      <button
        v-if="selectionStore.hasSelection"
        class="tab"
        :class="{ active: activeTab === 'detail' }"
        @click="activeTab = 'detail'"
      >Detail</button>
      <button
        v-if="searchResults.length > 0"
        class="tab"
        :class="{ active: activeTab === 'search' }"
        @click="activeTab = 'search'"
      >Search ({{ searchResults.length }})</button>
      <button
        class="tab"
        :class="{ active: activeTab === 'filter' }"
        @click="activeTab = 'filter'"
      >Filters</button>
    </div>

    <!-- Detail mode -->
    <div v-if="activeTab === 'detail'" class="panel-content">
      <div v-if="element" class="panel-section">
        <div class="panel-header">
          <h3>{{ element.label }}</h3>
          <button class="close-btn" @click="selectionStore.clearSelection">&times;</button>
        </div>
        <dl class="detail-list">
          <dt>ID</dt>
          <dd>{{ element.id }}</dd>
          <dt>Type</dt>
          <dd>{{ element.type }}</dd>
          <dt>Coordinates</dt>
          <dd>{{ element.lng.toFixed(4) }}, {{ element.lat.toFixed(4) }}</dd>
          <dt>Version</dt>
          <dd>{{ element.version }}</dd>
          <dt>Updated</dt>
          <dd>{{ element.updatedAt }}</dd>
        </dl>
        <div v-if="Object.keys(element.properties).length > 0" class="properties">
          <h4>Properties</h4>
          <dl class="detail-list">
            <template v-for="(value, key) in element.properties" :key="key">
              <dt>{{ key }}</dt>
              <dd>{{ value }}</dd>
            </template>
          </dl>
        </div>
      </div>
      <div v-else-if="selectionStore.hasSelection" class="panel-content">
        <p>Element not found in working set.</p>
      </div>
    </div>

    <!-- Search results mode -->
    <div v-if="activeTab === 'search'" class="panel-content">
      <div
        v-for="el in searchResults"
        :key="el.id"
        class="search-result"
        @click="$emit('flyTo', el)"
      >
        <span class="result-label">{{ el.label }}</span>
        <span class="result-type">{{ el.type }}</span>
      </div>
    </div>

    <!-- Filter mode -->
    <div v-if="activeTab === 'filter'" class="panel-content">
      <FilterPanel />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useSearch } from '@/composables/use-search'
import FilterPanel from '@/components/FilterPanel.vue'
import type { NetworkElement } from '@/types/topology'

defineEmits<{
  flyTo: [element: NetworkElement]
}>()

const topologyStore = useTopologyStore()
const selectionStore = useSelectionStore()
const { results: searchResults } = useSearch()

const activeTab = ref<'detail' | 'search' | 'filter'>('detail')

const element = computed(() => {
  if (!selectionStore.primarySelectedId) return null
  return topologyStore.getElement(selectionStore.primarySelectedId)
})

const isOpen = computed(
  () => selectionStore.hasSelection || searchResults.value.length > 0 || activeTab.value === 'filter',
)

// Auto-switch tabs
watch(() => selectionStore.hasSelection, (has) => {
  if (has) activeTab.value = 'detail'
})

watch(searchResults, (results) => {
  if (results.length > 0) activeTab.value = 'search'
})
</script>

<style scoped>
.side-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 320px;
  height: 100%;
  background: #1e1e2e;
  color: #cdd6f4;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.side-panel.open {
  transform: translateX(0);
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 8px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #6c7086;
  font-size: 12px;
  cursor: pointer;
}

.tab.active {
  color: #89b4fa;
  border-bottom-color: #89b4fa;
}

.panel-content {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  background: none;
  border: none;
  color: #cdd6f4;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}

.detail-list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 13px;
}

.detail-list dt {
  color: #89b4fa;
  font-weight: 600;
}

.detail-list dd {
  margin: 0;
  word-break: break-all;
}

.properties {
  margin-top: 16px;
}

.properties h4 {
  font-size: 14px;
  margin: 0 0 8px;
}

.search-result {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #313244;
  cursor: pointer;
  font-size: 13px;
}

.search-result:hover {
  background: #313244;
  margin: 0 -16px;
  padding: 8px 16px;
}

.result-label {
  color: #cdd6f4;
}

.result-type {
  color: #89b4fa;
  font-size: 11px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SidePanel.vue
git commit -m "feat: update SidePanel with search results and filter tabs"
```

---

## Task 14: Update StatusBar with View Mode Indicator

**Files:**
- Modify: `src/components/StatusBar.vue`

- [ ] **Step 1: Update StatusBar**

```vue
<!-- src/components/StatusBar.vue -->
<template>
  <footer class="status-bar">
    <span class="view-badge">{{ viewModeStore.isSchematic ? 'Schematic' : 'Map' }}</span>
    <span>Elements: {{ topologyStore.nodeCount }}</span>
    <span>Links: {{ topologyStore.edgeCount }}</span>
    <span v-if="topologyStore.clusterCount > 0">Clusters: {{ topologyStore.clusterCount }}</span>
    <span>Zoom: {{ viewportStore.zoom.toFixed(1) }}</span>
  </footer>
</template>

<script setup lang="ts">
import { useTopologyStore } from '@/stores/topology'
import { useViewportStore } from '@/stores/viewport'
import { useViewModeStore } from '@/stores/view-mode'

const topologyStore = useTopologyStore()
const viewportStore = useViewportStore()
const viewModeStore = useViewModeStore()
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 28px;
  padding: 0 16px;
  background: #181825;
  color: #a6adc8;
  font-size: 12px;
  border-top: 1px solid #313244;
  z-index: 20;
}

.view-badge {
  padding: 1px 8px;
  background: #313244;
  border-radius: 3px;
  font-size: 11px;
  color: #89b4fa;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StatusBar.vue
git commit -m "feat: update StatusBar with view mode and cluster count"
```

---

## Task 15: Update TopologyView to Switch Between MapView and SchematicView

**Files:**
- Modify: `src/views/TopologyView.vue`

- [ ] **Step 1: Update TopologyView**

```vue
<!-- src/views/TopologyView.vue -->
<template>
  <div class="topology-view">
    <TopToolbar @fly-to="onFlyTo" />
    <div class="main-area">
      <SidePanel @fly-to="onFlyTo" />
      <MapView
        v-if="!viewModeStore.isSchematic"
        @element-click="onElementClick"
        @element-hover="onElementHover"
      />
      <SchematicView
        v-else
        @element-click="onElementClick"
        @element-hover="onElementHover"
      />
    </div>
    <StatusBar />
  </div>
</template>

<script setup lang="ts">
import TopToolbar from '@/components/TopToolbar.vue'
import MapView from '@/components/MapView.vue'
import SchematicView from '@/components/SchematicView.vue'
import SidePanel from '@/components/SidePanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import { useViewModeStore } from '@/stores/view-mode'
import type { NetworkElement } from '@/types/topology'

const viewModeStore = useViewModeStore()

function onElementClick(id: string) {
  // Selection is handled inside views via the selection store
}

function onElementHover(id: string | null) {
  // Future: tooltip rendering
}

function onFlyTo(element: NetworkElement) {
  // Future: animate viewport to element position
}
</script>

<style scoped>
.topology-view {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #1e1e2e;
}

.main-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/views/TopologyView.vue
git commit -m "feat: update TopologyView to switch between MapView and SchematicView"
```

---

## Task 16: Multi-Select with Ctrl+Click in MapView

**Files:**
- Modify: `src/components/MapView.vue`

The selection store already supports `toggleElement()` for multi-select. We need to wire Ctrl+click in the MapView component.

- [ ] **Step 1: Update MapView click handler**

In `src/components/MapView.vue`, update the `handleClick` function:

```typescript
function handleClick(id: string, event?: PointerEvent) {
  if (event?.ctrlKey || event?.metaKey) {
    selectionStore.toggleElement(id)
  } else {
    selectionStore.selectElement(id)
  }
  emit('elementClick', id)
}
```

Update the `useDeckLayers` call to pass the event through. Since Deck.gl's `onClick` info contains the `srcEvent`, modify the click handler in `use-deck-layers.ts` to forward it. For simplicity, change the callback signature:

In `src/composables/use-deck-layers.ts`, update the `onClick` in the nodes layer:

```typescript
onClick: (info: { object?: NetworkElement; srcEvent?: PointerEvent }) => {
  if (info.object) onElementClick(info.object.id, info.srcEvent)
},
```

And update the function signature:

```typescript
export function useDeckLayers(
  onElementClick: (id: string, event?: PointerEvent) => void,
  onElementHover: (id: string | null) => void,
  layoutPositions?: () => Map<string, LayoutPosition>,
)
```

- [ ] **Step 2: Update SchematicView similarly**

In `src/components/SchematicView.vue`, update `handleClick`:

```typescript
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
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.vue src/components/SchematicView.vue src/composables/use-deck-layers.ts
git commit -m "feat: add multi-select with Ctrl+click in both views"
```

---

## Task 17: Final Integration Test — Run All Tests

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (existing 38 + new tests from tasks 2-7)

- [ ] **Step 2: Run type check**

```bash
npx vue-tsc --build
```

Expected: No type errors

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds

---
