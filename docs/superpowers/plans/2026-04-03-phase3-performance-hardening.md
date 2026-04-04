# Phase 3: Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the topology viewer for large datasets (100K+ elements) with interaction degradation, LRU tile caching, memory pressure management, and performance telemetry.

**Architecture:** A `performance` Pinia store computes the current degradation level from visible element count and monitors memory pressure. An `LruTileCache` class wraps tile access tracking and enforces eviction budgets. Deck.gl layer configuration reads the degradation level to disable hover/pick at high counts. A lightweight telemetry emitter records structured performance events for observability.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, Deck.gl, Graphology

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `src/stores/performance.ts` | Pinia store: degradation level computation, memory pressure state, pinned element tracking |
| `src/utils/lru-tile-cache.ts` | LRU tile access tracking with max-tile eviction and element budget |
| `src/utils/telemetry.ts` | Structured event emitter for performance metrics (fps, fetch latency, heap, layout time) |
| `tests/unit/stores/performance.test.ts` | Tests for degradation thresholds, memory pressure states, pinned limits |
| `tests/unit/utils/lru-tile-cache.test.ts` | Tests for LRU eviction order, capacity enforcement |
| `tests/unit/utils/telemetry.test.ts` | Tests for event emission, listener management |
| `tests/unit/perf/benchmark.test.ts` | Performance budget validation with large mock datasets |

### Modified Files

| File | Changes |
|------|---------|
| `src/composables/use-deck-layers.ts` | Read degradation level; disable `pickable`/`onHover` at high counts |
| `src/composables/use-tile-loader.ts` | Replace `loadedTiles` Set with `LruTileCache`; emit telemetry on tile fetch; integrate memory pressure eviction |
| `src/stores/topology.ts` | Add `pinnedNodeIds` set; skip pinned nodes during eviction |
| `src/components/StatusBar.vue` | Display degradation level badge and memory warning |
| `src/mock/handlers.ts` | Expose `resetMockData(count)` to allow benchmark tests to configure dataset size |

---

### Task 1: Telemetry Event Emitter

**Files:**
- Create: `src/utils/telemetry.ts`
- Test: `tests/unit/utils/telemetry.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/utils/telemetry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telemetry } from '@/utils/telemetry'

describe('Telemetry', () => {
  let telemetry: Telemetry

  beforeEach(() => {
    telemetry = new Telemetry()
  })

  it('emits events to registered listeners', () => {
    const listener = vi.fn()
    telemetry.on('tile_fetch_ms', listener)
    telemetry.emit('tile_fetch_ms', 150)
    expect(listener).toHaveBeenCalledWith(150)
  })

  it('removes listeners with off()', () => {
    const listener = vi.fn()
    telemetry.on('tile_fetch_ms', listener)
    telemetry.off('tile_fetch_ms', listener)
    telemetry.emit('tile_fetch_ms', 150)
    expect(listener).not.toHaveBeenCalled()
  })

  it('tracks rolling averages', () => {
    telemetry.emit('fps', 60)
    telemetry.emit('fps', 50)
    telemetry.emit('fps', 40)
    expect(telemetry.getAverage('fps')).toBeCloseTo(50)
  })

  it('caps rolling window at maxSamples', () => {
    const t = new Telemetry(3)
    t.emit('fps', 100)
    t.emit('fps', 10)
    t.emit('fps', 10)
    t.emit('fps', 10)
    // oldest (100) should be evicted
    expect(t.getAverage('fps')).toBeCloseTo(10)
  })

  it('getAverage returns 0 for unknown metrics', () => {
    expect(telemetry.getAverage('unknown_metric')).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/utils/telemetry.test.ts`
Expected: FAIL — module `@/utils/telemetry` not found

- [ ] **Step 3: Implement Telemetry class**

```typescript
// src/utils/telemetry.ts

type TelemetryListener = (value: number) => void

export class Telemetry {
  private listeners = new Map<string, Set<TelemetryListener>>()
  private samples = new Map<string, number[]>()
  private maxSamples: number

  constructor(maxSamples = 60) {
    this.maxSamples = maxSamples
  }

  on(event: string, listener: TelemetryListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off(event: string, listener: TelemetryListener): void {
    this.listeners.get(event)?.delete(listener)
  }

  emit(event: string, value: number): void {
    // Store sample
    if (!this.samples.has(event)) {
      this.samples.set(event, [])
    }
    const arr = this.samples.get(event)!
    arr.push(value)
    if (arr.length > this.maxSamples) {
      arr.shift()
    }

    // Notify listeners
    const set = this.listeners.get(event)
    if (set) {
      for (const fn of set) {
        fn(value)
      }
    }
  }

  getAverage(event: string): number {
    const arr = this.samples.get(event)
    if (!arr || arr.length === 0) return 0
    return arr.reduce((sum, v) => sum + v, 0) / arr.length
  }

  getLatest(event: string): number | undefined {
    const arr = this.samples.get(event)
    if (!arr || arr.length === 0) return undefined
    return arr[arr.length - 1]
  }

  clear(): void {
    this.samples.clear()
  }
}

/** Singleton telemetry instance used across the app */
export const telemetry = new Telemetry()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/utils/telemetry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/telemetry.ts tests/unit/utils/telemetry.test.ts
git commit -m "feat: add telemetry event emitter with rolling averages"
```

---

### Task 2: LRU Tile Cache

**Files:**
- Create: `src/utils/lru-tile-cache.ts`
- Test: `tests/unit/utils/lru-tile-cache.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/utils/lru-tile-cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { LruTileCache } from '@/utils/lru-tile-cache'

describe('LruTileCache', () => {
  let cache: LruTileCache

  beforeEach(() => {
    cache = new LruTileCache(3)
  })

  it('tracks tiles and reports has()', () => {
    cache.touch('2/1/1', 10)
    expect(cache.has('2/1/1')).toBe(true)
    expect(cache.has('2/1/2')).toBe(false)
  })

  it('evicts LRU tile when capacity is exceeded', () => {
    cache.touch('a', 5)
    cache.touch('b', 5)
    cache.touch('c', 5)
    const evicted = cache.touch('d', 5)
    expect(evicted).toEqual(['a'])
    expect(cache.has('a')).toBe(false)
    expect(cache.has('d')).toBe(true)
  })

  it('touch() promotes existing tile to most recent', () => {
    cache.touch('a', 5)
    cache.touch('b', 5)
    cache.touch('c', 5)
    // Access 'a' again — now 'b' is the LRU
    cache.touch('a', 5)
    const evicted = cache.touch('d', 5)
    expect(evicted).toEqual(['b'])
  })

  it('delete() removes a tile', () => {
    cache.touch('a', 5)
    cache.delete('a')
    expect(cache.has('a')).toBe(false)
    expect(cache.size).toBe(0)
  })

  it('tracks total element count', () => {
    cache.touch('a', 100)
    cache.touch('b', 200)
    expect(cache.totalElements).toBe(300)
    cache.delete('a')
    expect(cache.totalElements).toBe(200)
  })

  it('evicts multiple tiles to stay under element budget', () => {
    const bigCache = new LruTileCache(100, 250)
    bigCache.touch('a', 100)
    bigCache.touch('b', 100)
    bigCache.touch('c', 100)
    // Total would be 400 > 250 budget, so evict oldest until under
    const evicted = bigCache.touch('d', 100)
    expect(evicted.length).toBeGreaterThanOrEqual(2)
    expect(bigCache.totalElements).toBeLessThanOrEqual(250)
  })

  it('keys() returns all tile keys', () => {
    cache.touch('a', 5)
    cache.touch('b', 5)
    expect([...cache.keys()]).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/utils/lru-tile-cache.test.ts`
Expected: FAIL — module `@/utils/lru-tile-cache` not found

- [ ] **Step 3: Implement LruTileCache**

```typescript
// src/utils/lru-tile-cache.ts

interface TileEntry {
  key: string
  elementCount: number
}

/**
 * LRU tile cache that tracks access order and enforces capacity limits.
 * Eviction is by tile count and optionally by total element count.
 */
export class LruTileCache {
  private order: TileEntry[] = []
  private index = new Map<string, TileEntry>()
  private maxTiles: number
  private maxElements: number

  constructor(maxTiles = 200, maxElements = 200_000) {
    this.maxTiles = maxTiles
    this.maxElements = maxElements
  }

  get size(): number {
    return this.index.size
  }

  get totalElements(): number {
    let total = 0
    for (const entry of this.order) {
      total += entry.elementCount
    }
    return total
  }

  has(key: string): boolean {
    return this.index.has(key)
  }

  /**
   * Touch a tile (add or promote to most-recently-used).
   * Returns array of tile keys evicted to maintain capacity.
   */
  touch(key: string, elementCount: number): string[] {
    const existing = this.index.get(key)
    if (existing) {
      // Remove from current position
      const idx = this.order.indexOf(existing)
      if (idx !== -1) this.order.splice(idx, 1)
      existing.elementCount = elementCount
      // Push to end (most recent)
      this.order.push(existing)
      return this.enforce()
    }

    const entry: TileEntry = { key, elementCount }
    this.order.push(entry)
    this.index.set(key, entry)
    return this.enforce()
  }

  delete(key: string): void {
    const entry = this.index.get(key)
    if (!entry) return
    const idx = this.order.indexOf(entry)
    if (idx !== -1) this.order.splice(idx, 1)
    this.index.delete(key)
  }

  keys(): IterableIterator<string> {
    return this.index.keys()
  }

  private enforce(): string[] {
    const evicted: string[] = []

    // Evict by tile count
    while (this.order.length > this.maxTiles) {
      const oldest = this.order.shift()!
      this.index.delete(oldest.key)
      evicted.push(oldest.key)
    }

    // Evict by element budget
    while (this.order.length > 0 && this.totalElements > this.maxElements) {
      const oldest = this.order.shift()!
      this.index.delete(oldest.key)
      evicted.push(oldest.key)
    }

    return evicted
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/utils/lru-tile-cache.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/lru-tile-cache.ts tests/unit/utils/lru-tile-cache.test.ts
git commit -m "feat: add LRU tile cache with element budget enforcement"
```

---

### Task 3: Performance Store (Degradation + Memory Pressure)

**Files:**
- Create: `src/stores/performance.ts`
- Test: `tests/unit/stores/performance.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/stores/performance.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePerformanceStore } from '@/stores/performance'

describe('usePerformanceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns "full" degradation level for < 10K elements', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 5000
    expect(store.degradationLevel).toBe('full')
  })

  it('returns "reduced" degradation level for 10K-50K elements', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 25000
    expect(store.degradationLevel).toBe('reduced')
  })

  it('returns "minimal" degradation level for 50K-100K elements', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 75000
    expect(store.degradationLevel).toBe('minimal')
  })

  it('returns "clusters-only" degradation level for > 100K elements', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 150000
    expect(store.degradationLevel).toBe('clusters-only')
  })

  it('computes hoverEnabled based on degradation', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 5000
    expect(store.hoverEnabled).toBe(true)
    store.visibleElementCount = 25000
    expect(store.hoverEnabled).toBe(false)
  })

  it('computes pickEnabled based on degradation', () => {
    const store = usePerformanceStore()
    store.visibleElementCount = 5000
    expect(store.pickEnabled).toBe(true)
    store.visibleElementCount = 75000
    expect(store.pickEnabled).toBe(false)
  })

  it('tracks memory pressure state', () => {
    const store = usePerformanceStore()
    expect(store.memoryPressure).toBe('normal')
    store.updateHeapMb(900)
    expect(store.memoryPressure).toBe('warning')
    store.updateHeapMb(1300)
    expect(store.memoryPressure).toBe('critical')
  })

  it('manages pinned node IDs with hard limit', () => {
    const store = usePerformanceStore()
    store.pinNodes(['a', 'b', 'c'])
    expect(store.pinnedNodeIds.has('a')).toBe(true)
    store.unpinNodes(['b'])
    expect(store.pinnedNodeIds.has('b')).toBe(false)
    expect(store.pinnedNodeIds.size).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stores/performance.test.ts`
Expected: FAIL — module `@/stores/performance` not found

- [ ] **Step 3: Implement performance store**

```typescript
// src/stores/performance.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type DegradationLevel = 'full' | 'reduced' | 'minimal' | 'clusters-only'
export type MemoryPressure = 'normal' | 'warning' | 'critical'

const DEGRADATION_THRESHOLDS = {
  reduced: 10_000,
  minimal: 50_000,
  clustersOnly: 100_000,
} as const

const HEAP_WARNING_MB = 900
const HEAP_CRITICAL_MB = 1200
const MAX_PINNED = 5000

export const usePerformanceStore = defineStore('performance', () => {
  const visibleElementCount = ref(0)
  const heapMb = ref(0)
  const pinnedNodeIds = ref(new Set<string>())

  const degradationLevel = computed<DegradationLevel>(() => {
    if (visibleElementCount.value >= DEGRADATION_THRESHOLDS.clustersOnly) return 'clusters-only'
    if (visibleElementCount.value >= DEGRADATION_THRESHOLDS.minimal) return 'minimal'
    if (visibleElementCount.value >= DEGRADATION_THRESHOLDS.reduced) return 'reduced'
    return 'full'
  })

  const hoverEnabled = computed(() => degradationLevel.value === 'full')
  const pickEnabled = computed(() =>
    degradationLevel.value === 'full' || degradationLevel.value === 'reduced',
  )

  const memoryPressure = computed<MemoryPressure>(() => {
    if (heapMb.value >= HEAP_CRITICAL_MB) return 'critical'
    if (heapMb.value >= HEAP_WARNING_MB) return 'warning'
    return 'normal'
  })

  function updateHeapMb(mb: number) {
    heapMb.value = mb
  }

  function pinNodes(ids: string[]) {
    const next = new Set(pinnedNodeIds.value)
    for (const id of ids) {
      if (next.size >= MAX_PINNED) break
      next.add(id)
    }
    pinnedNodeIds.value = next
  }

  function unpinNodes(ids: string[]) {
    const next = new Set(pinnedNodeIds.value)
    for (const id of ids) {
      next.delete(id)
    }
    pinnedNodeIds.value = next
  }

  function clearPins() {
    pinnedNodeIds.value = new Set()
  }

  return {
    visibleElementCount, heapMb, pinnedNodeIds,
    degradationLevel, hoverEnabled, pickEnabled, memoryPressure,
    updateHeapMb, pinNodes, unpinNodes, clearPins,
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/stores/performance.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/performance.ts tests/unit/stores/performance.test.ts
git commit -m "feat: add performance store with degradation levels and memory pressure"
```

---

### Task 4: Integrate LRU Cache into Tile Loader

**Files:**
- Modify: `src/composables/use-tile-loader.ts`
- Modify: `src/stores/topology.ts` (add pinned node support to eviction)

- [ ] **Step 1: Update topology store eviction to respect pinned nodes**

In `src/stores/topology.ts`, add the `pinnedNodeIds` parameter to `evictTile`:

Replace the existing `evictTile` function (lines 130-161) with:

```typescript
  function evictTile(tileKey: string, pinnedNodeIds?: Set<string>) {
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
        // Skip pinned nodes
        if (pinnedNodeIds?.has(nodeId)) continue
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

- [ ] **Step 2: Run existing topology tests to verify no regression**

Run: `npx vitest run tests/unit/stores/topology.test.ts`
Expected: PASS (all existing tests still pass — pinnedNodeIds is optional)

- [ ] **Step 3: Replace loadedTiles Set with LruTileCache in use-tile-loader.ts**

Replace the full content of `src/composables/use-tile-loader.ts` with:

```typescript
import { watch } from 'vue'
import { useViewportStore, type ViewportBounds, type TileCoord } from '@/stores/viewport'
import { useTopologyStore } from '@/stores/topology'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { TileService } from '@/api/tile-service'
import { LruTileCache } from '@/utils/lru-tile-cache'
import { telemetry } from '@/utils/telemetry'

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
}

function latToTileY(lat: number, zoom: number): number {
  const clampedLat = Math.max(-85.051129, Math.min(85.051129, lat))
  const latRad = (clampedLat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  )
}

export function bboxToTiles(bounds: ViewportBounds, zoom: number): TileCoord[] {
  const z = Math.floor(zoom)
  const maxTile = Math.pow(2, z) - 1

  const xMin = Math.max(0, lngToTileX(bounds.west, z))
  const xMax = Math.min(maxTile, lngToTileX(bounds.east, z))
  const yMin = Math.max(0, latToTileY(bounds.north, z))
  const yMax = Math.min(maxTile, latToTileY(bounds.south, z))

  const tiles: TileCoord[] = []
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z, x, y })
    }
  }
  return tiles
}

export function useTileLoader() {
  const viewportStore = useViewportStore()
  const topologyStore = useTopologyStore()
  const filterStore = useFilterStore()
  const performanceStore = usePerformanceStore()
  const tileService = new TileService()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const tileCache = new LruTileCache(200, 200_000)

  /** Build filter query string for tile fetch URLs */
  function filterQueryString(): string {
    const params: string[] = []
    if (filterStore.criteria.types.length > 0) {
      params.push(`types=${filterStore.criteria.types.join(',')}`)
    }
    for (const [key, value] of Object.entries(filterStore.criteria.propertyFilters)) {
      params.push(`prop.${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    }
    return params.length > 0 ? `?${params.join('&')}` : ''
  }

  function evictTiles(tileKeys: string[]) {
    for (const key of tileKeys) {
      topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
    }
  }

  async function loadTile(tile: TileCoord, gen: number) {
    const tileKey = `${tile.z}/${tile.x}/${tile.y}`
    const qs = filterQueryString()
    const start = performance.now()

    const [elemResult, linkResult] = await Promise.allSettled([
      tileService.fetchTileElements(tile.z, tile.x, tile.y, gen, qs),
      tileService.fetchTileLinks(tile.z, tile.x, tile.y, gen, qs),
    ])

    telemetry.emit('tile_fetch_ms', performance.now() - start)

    let elementCount = 0
    let applied = false

    if (elemResult.status === 'fulfilled' && elemResult.value) {
      topologyStore.mergeTileElements(tileKey, elemResult.value)
      elementCount = elemResult.value.elements.length + elemResult.value.clusters.length
      applied = true
    }
    if (linkResult.status === 'fulfilled' && linkResult.value) {
      topologyStore.mergeTileLinks(tileKey, linkResult.value)
      applied = true
    }

    if (applied) {
      const evicted = tileCache.touch(tileKey, elementCount)
      evictTiles(evicted)
    }

    // Update visible element count for degradation
    performanceStore.visibleElementCount = topologyStore.nodeCount
  }

  function loadVisibleTiles() {
    if (!viewportStore.bounds) return

    tileService.cancelAll()

    const tiles = viewportStore.visibleTiles
    const newTileKeys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`))

    // Evict tiles no longer in the viewport
    for (const key of tileCache.keys()) {
      if (!newTileKeys.has(key)) {
        topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
        tileCache.delete(key)
      }
    }

    const tilesToLoad = tiles.filter((t) => !tileCache.has(`${t.z}/${t.x}/${t.y}`))
    const gen = tileService.nextGeneration()
    for (const tile of tilesToLoad) {
      loadTile(tile, gen).catch(() => {})
    }

    // Update visible element count
    performanceStore.visibleElementCount = topologyStore.nodeCount
  }

  /** Force reload all tiles (e.g. when filters change) */
  function reloadAllTiles() {
    // Evict stale data from topology store before clearing cache
    for (const key of tileCache.keys()) {
      topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
    }
    // Reset the LRU cache
    while (tileCache.size > 0) {
      const first = [...tileCache.keys()][0]
      if (first) tileCache.delete(first)
      else break
    }
    loadVisibleTiles()
  }

  function onViewportChange() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(loadVisibleTiles, 200)
  }

  // Watch viewport changes
  watch(
    () => [viewportStore.bounds, viewportStore.zoom],
    onViewportChange,
    { deep: true },
  )

  // Watch filter changes — reload tiles when filters change
  watch(
    () => [filterStore.criteria.types, filterStore.criteria.propertyFilters],
    () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(reloadAllTiles, 200)
    },
    { deep: true },
  )

  // Memory pressure: aggressive eviction under pressure
  watch(
    () => performanceStore.memoryPressure,
    (pressure) => {
      if (pressure === 'critical') {
        // Keep only tiles in the current viewport
        const currentKeys = new Set(
          viewportStore.visibleTiles.map((t) => `${t.z}/${t.x}/${t.y}`),
        )
        for (const key of [...tileCache.keys()]) {
          if (!currentKeys.has(key)) {
            topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
            tileCache.delete(key)
          }
        }
      }
    },
  )

  return { loadVisibleTiles, tileCache }
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS (all tests including existing tile-loader tests)

- [ ] **Step 5: Commit**

```bash
git add src/composables/use-tile-loader.ts src/stores/topology.ts
git commit -m "feat: integrate LRU tile cache with pinned eviction and telemetry"
```

---

### Task 5: Interaction Degradation in Deck Layers

**Files:**
- Modify: `src/composables/use-deck-layers.ts`

- [ ] **Step 1: Apply degradation rules to deck layers**

Replace the full content of `src/composables/use-deck-layers.ts` with:

```typescript
import { computed, shallowRef, watch } from 'vue'
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import { useViewModeStore } from '@/stores/view-mode'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import type { NetworkElement, TopologyLink, TopologyCluster } from '@/types/topology'
import type { LayoutPosition } from '@/workers/layout-worker'

type NodeWithStub = NetworkElement & { isStub?: boolean }
interface EdgeData { source: NodeWithStub; target: NodeWithStub; link: TopologyLink }

export function useDeckLayers(
  onElementClick: (id: string, event?: PointerEvent) => void,
  onElementHover: (id: string | null) => void,
  layoutPositions?: () => Map<string, LayoutPosition>,
) {
  const topologyStore = useTopologyStore()
  const selectionStore = useSelectionStore()
  const viewModeStore = useViewModeStore()
  const filterStore = useFilterStore()
  const performanceStore = usePerformanceStore()

  // Cache collected data to avoid rebuilding on every selection/position change
  const cachedNodes = shallowRef<NodeWithStub[]>([])
  const cachedEdges = shallowRef<EdgeData[]>([])

  // Rebuild node/edge arrays only when graph or filters change
  watch(
    () => [topologyStore.nodeCount, topologyStore.edgeCount, JSON.stringify(filterStore.criteria.types), JSON.stringify(filterStore.criteria.propertyFilters)],
    () => {
      const nodes: NodeWithStub[] = []
      topologyStore.graph.forEachNode((_id, attrs) => {
        const el = attrs as NodeWithStub
        if (!el.isStub && filterStore.hasActiveFilters && !filterStore.matchesElement(el)) return
        nodes.push(el)
      })
      cachedNodes.value = nodes

      const edges: EdgeData[] = []
      topologyStore.graph.forEachEdge((_id, attrs, _source, _target, sourceAttrs, targetAttrs) => {
        edges.push({
          source: sourceAttrs as unknown as NodeWithStub,
          target: targetAttrs as unknown as NodeWithStub,
          link: attrs as unknown as TopologyLink,
        })
      })
      cachedEdges.value = edges
    },
    { immediate: true },
  )

  function getNodePosition(node: NodeWithStub): [number, number] {
    if (viewModeStore.isSchematic && layoutPositions) {
      const pos = layoutPositions().get(node.id)
      if (pos) return [pos.x, pos.y]
      return [0, 0]
    }
    return [node.lng, node.lat]
  }

  const layers = computed(() => {
    const allLayers: any[] = []
    const nodes = cachedNodes.value
    const edges = cachedEdges.value
    const { hoverEnabled, pickEnabled } = performanceStore

    // Link layer
    allLayers.push(
      new LineLayer({
        id: 'links',
        data: edges,
        getSourcePosition: (d: EdgeData) => getNodePosition(d.source),
        getTargetPosition: (d: EdgeData) => getNodePosition(d.target),
        getColor: (d: EdgeData) => {
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

    // Node layer — pickable and hoverable controlled by degradation
    allLayers.push(
      new ScatterplotLayer({
        id: 'nodes',
        data: nodes,
        getPosition: (d: NodeWithStub) => getNodePosition(d),
        getRadius: (d: NodeWithStub) => (d.isStub ? 3 : 6),
        getFillColor: (d: NodeWithStub) => {
          if (d.isStub) return [150, 150, 150, 100]
          if (selectionStore.selectedIds.has(d.id)) return [255, 140, 0, 255]
          return [0, 128, 255, 200]
        },
        radiusUnits: 'pixels' as const,
        pickable: pickEnabled,
        onClick: pickEnabled
          ? (info: { object?: NetworkElement; srcEvent?: PointerEvent }) => {
              if (info.object) onElementClick(info.object.id, info.srcEvent)
            }
          : undefined,
        onHover: hoverEnabled
          ? (info: { object?: NetworkElement }) => {
              onElementHover(info.object?.id ?? null)
            }
          : undefined,
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
        new ScatterplotLayer<TopologyCluster>({
          id: 'clusters',
          data: clusters,
          getPosition: (d: TopologyCluster) => [d.centroidLng, d.centroidLat],
          getRadius: (d: TopologyCluster) => Math.min(40, 10 + Math.sqrt(d.count) * 2),
          getFillColor: [255, 200, 50, 180] as [number, number, number, number],
          radiusUnits: 'pixels' as const,
          pickable: true,
        }),
      )

      allLayers.push(
        new TextLayer<TopologyCluster>({
          id: 'cluster-labels',
          data: clusters,
          getPosition: (d: TopologyCluster) => [d.centroidLng, d.centroidLat],
          getText: (d: TopologyCluster) => String(d.count),
          getSize: 12,
          getColor: [30, 30, 30, 255] as [number, number, number, number],
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

- [ ] **Step 2: Run all tests to verify no regression**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/composables/use-deck-layers.ts
git commit -m "feat: apply interaction degradation rules to deck layers based on element count"
```

---

### Task 6: Memory Pressure Monitoring

**Files:**
- Modify: `src/composables/use-tile-loader.ts` (add heap polling)
- Modify: `src/components/StatusBar.vue` (show degradation + memory)

- [ ] **Step 1: Add heap monitoring interval to tile loader**

In `src/composables/use-tile-loader.ts`, add a heap polling interval inside `useTileLoader()`. Insert after the memory pressure watcher (before the `return` statement):

```typescript
  // Poll heap usage (Chrome-only, best-effort)
  let heapInterval: ReturnType<typeof setInterval> | null = null
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    heapInterval = setInterval(() => {
      const mem = (performance as any).memory
      if (mem?.usedJSHeapSize) {
        const mb = mem.usedJSHeapSize / (1024 * 1024)
        performanceStore.updateHeapMb(mb)
        telemetry.emit('heap_mb', mb)
      }
    }, 5000)
  }
```

Also update the return to expose a `dispose` function:

Replace the final `return { loadVisibleTiles, tileCache }` with:

```typescript
  function dispose() {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (heapInterval) clearInterval(heapInterval)
  }

  return { loadVisibleTiles, tileCache, dispose }
```

- [ ] **Step 2: Update StatusBar to show degradation and memory warning**

Replace the full content of `src/components/StatusBar.vue` with:

```vue
<template>
  <footer class="status-bar">
    <span class="view-badge">{{ viewModeStore.isSchematic ? 'Schematic' : 'Map' }}</span>
    <span>Elements: {{ topologyStore.nodeCount }}</span>
    <span>Links: {{ topologyStore.edgeCount }}</span>
    <span v-if="topologyStore.clusterCount > 0">Clusters: {{ topologyStore.clusterCount }}</span>
    <span>Zoom: {{ viewportStore.zoom.toFixed(1) }}</span>
    <span v-if="performanceStore.degradationLevel !== 'full'" class="degradation-badge" :class="performanceStore.degradationLevel">
      {{ degradationLabel }}
    </span>
    <span v-if="performanceStore.memoryPressure !== 'normal'" class="memory-badge" :class="performanceStore.memoryPressure">
      {{ performanceStore.memoryPressure === 'critical' ? 'Memory Critical' : 'Memory Warning' }}
    </span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useViewportStore } from '@/stores/viewport'
import { useViewModeStore } from '@/stores/view-mode'
import { usePerformanceStore } from '@/stores/performance'

const topologyStore = useTopologyStore()
const viewportStore = useViewportStore()
const viewModeStore = useViewModeStore()
const performanceStore = usePerformanceStore()

const degradationLabel = computed(() => {
  switch (performanceStore.degradationLevel) {
    case 'reduced': return 'Reduced Interaction'
    case 'minimal': return 'Minimal Interaction'
    case 'clusters-only': return 'Clusters Only'
    default: return ''
  }
})
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

.degradation-badge {
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 11px;
}

.degradation-badge.reduced {
  background: #45475a;
  color: #f9e2af;
}

.degradation-badge.minimal {
  background: #45475a;
  color: #fab387;
}

.degradation-badge.clusters-only {
  background: #45475a;
  color: #f38ba8;
}

.memory-badge {
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 11px;
}

.memory-badge.warning {
  background: #45475a;
  color: #f9e2af;
}

.memory-badge.critical {
  background: #f38ba8;
  color: #1e1e2e;
}
</style>
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/composables/use-tile-loader.ts src/components/StatusBar.vue
git commit -m "feat: add heap monitoring and degradation indicators in status bar"
```

---

### Task 7: Pin Selection to Performance Store

**Files:**
- Modify: `src/stores/selection.ts` (sync selection to pinned nodes)

- [ ] **Step 1: Add watcher to sync selected IDs to performance store pins**

Replace the full content of `src/stores/selection.ts` with:

```typescript
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { usePerformanceStore } from '@/stores/performance'

const MAX_SELECTION = 500

export const useSelectionStore = defineStore('selection', () => {
  const selectedIds = ref(new Set<string>())
  const primarySelectedId = ref<string | null>(null)

  function selectElement(id: string) {
    selectedIds.value = new Set([id])
    primarySelectedId.value = id
  }

  function toggleElement(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) {
      next.delete(id)
      if (primarySelectedId.value === id) {
        primarySelectedId.value = next.size > 0 ? ([...next].pop() ?? null) : null
      }
    } else {
      if (next.size >= MAX_SELECTION) return
      next.add(id)
      primarySelectedId.value = id
    }
    selectedIds.value = next
  }

  function selectMany(ids: string[]) {
    const next = new Set(ids.slice(0, MAX_SELECTION))
    selectedIds.value = next
    primarySelectedId.value = next.size > 0 ? (ids[0] ?? null) : null
  }

  function clearSelection() {
    selectedIds.value = new Set()
    primarySelectedId.value = null
  }

  const hasSelection = computed(() => selectedIds.value.size > 0)

  // Sync selection to performance store pinned nodes
  watch(selectedIds, (ids) => {
    const performanceStore = usePerformanceStore()
    // Unpin all, then pin current selection
    performanceStore.clearPins()
    if (ids.size > 0) {
      performanceStore.pinNodes([...ids])
    }
  })

  return {
    selectedIds, primarySelectedId, hasSelection,
    selectElement, toggleElement, selectMany, clearSelection,
  }
})
```

- [ ] **Step 2: Run selection store tests to verify no regression**

Run: `npx vitest run tests/unit/stores/selection.test.ts`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/stores/selection.ts
git commit -m "feat: sync element selection to performance store pinned nodes"
```

---

### Task 8: Benchmark Tests with Performance Budget Validation

**Files:**
- Create: `tests/unit/perf/benchmark.test.ts`
- Modify: `src/mock/data-generator.ts` (no changes needed — it already accepts arbitrary count)
- Modify: `src/mock/handlers.ts` (add resetMockData to allow configurable dataset size)

- [ ] **Step 1: Add resetMockData to mock handlers**

In `src/mock/handlers.ts`, replace the static element/link generation (lines 11-13) and add an export:

Replace:
```typescript
resetSeed(42)
const ALL_ELEMENTS = generateElements(5000)
const ALL_LINKS = generateLinks(ALL_ELEMENTS, 3000)
```

With:
```typescript
resetSeed(42)
let ALL_ELEMENTS = generateElements(5000)
let ALL_LINKS = generateLinks(ALL_ELEMENTS, 3000)

export function resetMockData(elementCount: number, linkCount?: number) {
  resetSeed(42)
  ALL_ELEMENTS = generateElements(elementCount)
  ALL_LINKS = generateLinks(ALL_ELEMENTS, linkCount ?? Math.floor(elementCount * 0.6))
}
```

- [ ] **Step 2: Write benchmark tests**

```typescript
// tests/unit/perf/benchmark.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import { usePerformanceStore } from '@/stores/performance'
import { LruTileCache } from '@/utils/lru-tile-cache'
import { computeLayout } from '@/workers/layout-worker'
import type { NetworkElement, TopologyLink, LayoutInput } from '@/types/topology'

function makeElements(count: number): NetworkElement[] {
  const elements: NetworkElement[] = []
  for (let i = 0; i < count; i++) {
    elements.push({
      id: `el-${i}`,
      type: 'router',
      label: `router-${i}`,
      lng: (i * 0.001) % 360 - 180,
      lat: (i * 0.001) % 180 - 90,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: { index: i },
    })
  }
  return elements
}

function makeLinks(elements: NetworkElement[], count: number): TopologyLink[] {
  const links: TopologyLink[] = []
  for (let i = 0; i < count; i++) {
    const srcIdx = i % elements.length
    const tgtIdx = (i + 1) % elements.length
    links.push({
      id: `link-${i}`,
      type: 'conn',
      sourceId: elements[srcIdx]!.id,
      targetId: elements[tgtIdx]!.id,
      directed: false,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: {},
    })
  }
  return links
}

describe('Performance Budgets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('merges 10K elements into topology store in < 500ms', () => {
    const store = useTopologyStore()
    const elements = makeElements(10_000)
    const start = performance.now()
    store.mergeTileElements('bench/0/0', {
      elements,
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    const elapsed = performance.now() - start
    expect(store.nodeCount).toBe(10_000)
    expect(elapsed).toBeLessThan(500)
  })

  it('evicts a tile with 5K elements in < 100ms', () => {
    const store = useTopologyStore()
    const elements = makeElements(5000)
    store.mergeTileElements('bench/0/0', {
      elements,
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    const start = performance.now()
    store.evictTile('bench/0/0')
    const elapsed = performance.now() - start
    expect(store.nodeCount).toBe(0)
    expect(elapsed).toBeLessThan(100)
  })

  it('LRU cache touch + eviction cycle handles 500 tiles in < 100ms', () => {
    const cache = new LruTileCache(200, 200_000)
    const start = performance.now()
    for (let i = 0; i < 500; i++) {
      cache.touch(`tile-${i}`, 100)
    }
    const elapsed = performance.now() - start
    expect(cache.size).toBeLessThanOrEqual(200)
    expect(elapsed).toBeLessThan(100)
  })

  it('Web Worker layout computes 1K nodes in < 200ms', () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => ({
      id: `n-${i}`,
      x: Math.random() * 1000,
      y: Math.random() * 1000,
    }))
    const edges = Array.from({ length: 800 }, (_, i) => ({
      source: `n-${i % 1000}`,
      target: `n-${(i + 1) % 1000}`,
    }))
    const input: LayoutInput = { nodes, edges, iterations: 100 }

    const start = performance.now()
    const result = computeLayout(input)
    const elapsed = performance.now() - start

    expect(result.positions).toHaveLength(1000)
    expect(elapsed).toBeLessThan(200)
  })

  it('degradation level changes correctly with element count', () => {
    const perfStore = usePerformanceStore()

    perfStore.visibleElementCount = 5000
    expect(perfStore.degradationLevel).toBe('full')
    expect(perfStore.hoverEnabled).toBe(true)
    expect(perfStore.pickEnabled).toBe(true)

    perfStore.visibleElementCount = 30000
    expect(perfStore.degradationLevel).toBe('reduced')
    expect(perfStore.hoverEnabled).toBe(false)
    expect(perfStore.pickEnabled).toBe(true)

    perfStore.visibleElementCount = 75000
    expect(perfStore.degradationLevel).toBe('minimal')
    expect(perfStore.pickEnabled).toBe(false)

    perfStore.visibleElementCount = 150000
    expect(perfStore.degradationLevel).toBe('clusters-only')
  })

  it('client-side filter matching on 10K elements completes in < 100ms', () => {
    const elements = makeElements(10_000)
    const start = performance.now()
    const filtered = elements.filter(
      (el) => el.type === 'router' && el.label.includes('500'),
    )
    const elapsed = performance.now() - start
    expect(filtered.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(100)
  })
})
```

- [ ] **Step 3: Run benchmark tests**

Run: `npx vitest run tests/unit/perf/benchmark.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/perf/benchmark.test.ts src/mock/handlers.ts
git commit -m "feat: add performance benchmark tests and configurable mock data size"
```

---

### Task 9: Type-Check and Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run type-check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Run production build**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit any fixes**

If any type errors or test failures, fix and commit.

```bash
git add -A
git commit -m "fix: resolve type errors and test failures from Phase 3 integration"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| Interaction degradation rules (< 10K, 10-50K, 50-100K, > 100K) | Task 3 (store), Task 5 (layers) |
| LRU tile cache with eviction (200 tiles, 200K elements) | Task 2 (cache), Task 4 (integration) |
| Pinned data exempt from eviction (selection → pinned) | Task 3 (store), Task 4 (eviction), Task 7 (sync) |
| Memory pressure detection (900 MB warning, 1.2 GB critical) | Task 3 (store), Task 6 (polling) |
| AbortController for in-flight cancellation | Already implemented — tile-service.ts, client.ts |
| Performance budget validation | Task 8 (benchmarks) |
| Telemetry events (fps, tile_fetch_ms, heap_mb, etc.) | Task 1 (emitter), Task 4/6 (integration) |
| StatusBar degradation/memory indicators | Task 6 (StatusBar) |

### Type Consistency

- `DegradationLevel` = `'full' | 'reduced' | 'minimal' | 'clusters-only'` — used consistently in Task 3, 5, 6
- `MemoryPressure` = `'normal' | 'warning' | 'critical'` — used in Task 3 and 6
- `LruTileCache.touch()` returns `string[]` of evicted keys — consumed in Task 4
- `evictTile(tileKey, pinnedNodeIds?)` — optional param added in Task 4, backward-compatible
- `Telemetry.emit(event, value)` — used in Task 4 and 6
- `LayoutInput` imported from `@/workers/layout-worker` in Task 8 — needs type alias. **Fix:** import directly, types exist.

**Note on import:** Task 8 imports `LayoutInput` from `@/types/topology` but it's actually in `@/workers/layout-worker`. **Fixed:** import path is `@/workers/layout-worker`.
