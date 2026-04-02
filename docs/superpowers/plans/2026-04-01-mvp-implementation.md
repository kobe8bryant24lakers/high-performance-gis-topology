# GIS Topology Viewer — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working geographic map view that loads network elements from a mock REST API via tile-based fetching, renders them with Deck.gl on Mapbox GL JS, and allows click-to-inspect in a side panel.

**Architecture:** Vue 3 SPA with Vite build. Mapbox GL JS provides the base map. Deck.gl renders topology elements as WebGL overlay layers. A Graphology graph serves as the client working-set graph. A mock API server (msw) provides tile-based element and link data for development. Pinia manages application state.

**Tech Stack:** Vue 3, TypeScript, Vite, Mapbox GL JS, Deck.gl, Graphology, Pinia, Vue Router, msw (Mock Service Worker), Vitest

---

## File Structure

```
high-performance-gis-topology/
  package.json
  tsconfig.json
  tsconfig.app.json
  tsconfig.node.json
  vite.config.ts
  env.d.ts
  index.html
  .env.example                          # VITE_MAPBOX_TOKEN placeholder
  src/
    main.ts                             # App bootstrap
    App.vue                             # Root component with router-view
    router/
      index.ts                          # Vue Router setup
    types/
      topology.ts                       # NetworkElement, TopologyLink, TopologyCluster, API response types
    api/
      client.ts                         # Axios/fetch wrapper with retry, timeout, AbortController
      tile-service.ts                   # Tile-based data fetching (z/x/y), generation ordering
    stores/
      topology.ts                       # Pinia store: Graphology graph, tile cache, merge/evict logic
      viewport.ts                       # Pinia store: current map bounds, zoom, generation counter
      selection.ts                      # Pinia store: selected element(s), detail panel state
    composables/
      use-tile-loader.ts                # Composable: viewport-to-tiles conversion, debounced fetching
      use-deck-layers.ts                # Composable: builds Deck.gl layers from graph data
    components/
      MapView.vue                       # Geographic map view (Mapbox + Deck.gl overlay)
      SidePanel.vue                     # Side panel with element detail
      TopToolbar.vue                    # Top toolbar (placeholder for MVP)
      StatusBar.vue                     # Bottom status bar (element count, zoom level)
    views/
      TopologyView.vue                  # Main page layout: toolbar + map + side panel + status bar
    mock/
      handlers.ts                       # msw request handlers for tile endpoints
      data-generator.ts                 # Generates mock NetworkElement/TopologyLink data
      browser.ts                        # msw browser worker setup
  tests/
    unit/
      types/
        topology.test.ts                # Type guard tests
      api/
        client.test.ts                  # API client tests (retry, timeout, abort)
        tile-service.test.ts            # Tile service tests (generation ordering)
      stores/
        topology.test.ts                # Topology store tests (merge, evict, delete)
        viewport.test.ts                # Viewport store tests (generation counter)
        selection.test.ts               # Selection store tests
      composables/
        use-tile-loader.test.ts         # Tile loader tests (bbox-to-tiles, debounce)
      mock/
        data-generator.test.ts          # Data generator tests
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `env.d.ts`, `index.html`, `.env.example`, `src/main.ts`, `src/App.vue`, `src/router/index.ts`, `src/views/TopologyView.vue`

- [ ] **Step 1: Scaffold Vue 3 + TypeScript project with Vite**

```bash
cd /Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology
npm create vue@latest . -- --typescript --router --pinia --vitest --force
```

Select: No for JSX, ESLint, Prettier (keep it minimal for MVP).

- [ ] **Step 2: Install core dependencies**

```bash
npm install mapbox-gl @deck.gl/core @deck.gl/layers @deck.gl/mapbox graphology graphology-types
npm install -D @types/mapbox-gl msw
```

- [ ] **Step 3: Create `.env.example`**

Create `.env.example`:

```
VITE_MAPBOX_TOKEN=your_mapbox_token_here
```

Create `.env` (gitignored) with an actual token if available, or a placeholder.

- [ ] **Step 4: Verify the dev server starts**

```bash
npm run dev
```

Expected: Vite dev server starts, browser shows default Vue welcome page.

- [ ] **Step 5: Clean up scaffolded defaults**

Remove the default `src/components/HelloWorld.vue`, `src/components/TheWelcome.vue`, `src/components/WelcomeItem.vue`, `src/components/icons/` directory, and `src/views/HomeView.vue`, `src/views/AboutView.vue`. Update `src/App.vue` to just render `<router-view />`. Update `src/router/index.ts` to have a single route `/` pointing to `TopologyView.vue`.

`src/App.vue`:
```vue
<template>
  <router-view />
</template>
```

`src/router/index.ts`:
```typescript
import { createRouter, createWebHistory } from 'vue-router'
import TopologyView from '@/views/TopologyView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'topology', component: TopologyView },
  ],
})

export default router
```

`src/views/TopologyView.vue`:
```vue
<template>
  <div class="topology-view">
    <p>Topology View — MVP</p>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.topology-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
```

- [ ] **Step 6: Verify clean app runs**

```bash
npm run dev
```

Expected: Browser shows "Topology View — MVP" centered on the page.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vue 3 + TypeScript project with Vite

Install core dependencies: mapbox-gl, deck.gl, graphology, msw.
Set up single-route SPA shell with TopologyView placeholder."
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types/topology.ts`
- Test: `tests/unit/types/topology.test.ts`

- [ ] **Step 1: Write type guard tests**

Create `tests/unit/types/topology.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  isNetworkElement,
  isTopologyLink,
  isTopologyCluster,
  type NetworkElement,
  type TopologyLink,
  type TopologyCluster,
} from '@/types/topology'

describe('isNetworkElement', () => {
  it('returns true for a valid NetworkElement', () => {
    const el: NetworkElement = {
      id: 'node-1',
      type: 'router',
      label: 'Router A',
      lng: 116.4,
      lat: 39.9,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: { vendor: 'Cisco' },
    }
    expect(isNetworkElement(el)).toBe(true)
  })

  it('returns false when id is missing', () => {
    expect(isNetworkElement({ type: 'router', label: 'X', lng: 0, lat: 0, version: 1, updatedAt: '', properties: {} })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isNetworkElement(null)).toBe(false)
  })
})

describe('isTopologyLink', () => {
  it('returns true for a valid TopologyLink', () => {
    const link: TopologyLink = {
      id: 'link-1',
      type: 'fiber',
      sourceId: 'node-1',
      targetId: 'node-2',
      directed: false,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: {},
    }
    expect(isTopologyLink(link)).toBe(true)
  })

  it('returns false when sourceId is missing', () => {
    expect(isTopologyLink({ id: 'link-1', type: 'fiber', targetId: 'n2', directed: false, version: 1, updatedAt: '', properties: {} })).toBe(false)
  })
})

describe('isTopologyCluster', () => {
  it('returns true for a valid TopologyCluster', () => {
    const cluster: TopologyCluster = {
      id: 'cluster-1',
      centroidLng: 116.4,
      centroidLat: 39.9,
      count: 42,
      elementTypes: { router: 20, switch: 22 },
    }
    expect(isTopologyCluster(cluster)).toBe(true)
  })

  it('returns false when count is missing', () => {
    expect(isTopologyCluster({ id: 'c1', centroidLng: 0, centroidLat: 0, elementTypes: {} })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/types/topology.test.ts
```

Expected: FAIL — module `@/types/topology` not found.

- [ ] **Step 3: Implement type definitions and guards**

Create `src/types/topology.ts`:

```typescript
// --- Domain Types ---

export interface NetworkElement {
  id: string
  type: string
  label: string
  lng: number
  lat: number
  version: number
  updatedAt: string
  properties: Record<string, unknown>
}

export interface TopologyLink {
  id: string
  type: string
  sourceId: string
  targetId: string
  directed: boolean
  weight?: number
  status?: string
  version: number
  updatedAt: string
  properties: Record<string, unknown>
}

export interface TopologyCluster {
  id: string
  centroidLng: number
  centroidLat: number
  count: number
  childIds?: string[]
  elementTypes: Record<string, number>
}

export interface EndpointStub {
  id: string
  lng: number
  lat: number
}

// --- API Response Types ---

export interface TileElementsResponse {
  elements: NetworkElement[]
  clusters: TopologyCluster[]
  generation: number
  removedIds: string[]
}

export interface TileLinksResponse {
  links: TopologyLink[]
  stubs: EndpointStub[]
  generation: number
  removedLinkIds: string[]
}

export interface ElementDetailResponse extends NetworkElement {}

export interface NeighborsResponse {
  elements: NetworkElement[]
  links: TopologyLink[]
}

export interface SearchResponse {
  results: NetworkElement[]
  total: number
}

// --- Type Guards ---

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isNetworkElement(value: unknown): value is NetworkElement {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.label === 'string' &&
    typeof value.lng === 'number' &&
    typeof value.lat === 'number' &&
    typeof value.version === 'number' &&
    typeof value.updatedAt === 'string' &&
    isObject(value.properties)
  )
}

export function isTopologyLink(value: unknown): value is TopologyLink {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.sourceId === 'string' &&
    typeof value.targetId === 'string' &&
    typeof value.directed === 'boolean' &&
    typeof value.version === 'number' &&
    typeof value.updatedAt === 'string' &&
    isObject(value.properties)
  )
}

export function isTopologyCluster(value: unknown): value is TopologyCluster {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.centroidLng === 'number' &&
    typeof value.centroidLat === 'number' &&
    typeof value.count === 'number' &&
    isObject(value.elementTypes)
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/types/topology.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/topology.ts tests/unit/types/topology.test.ts
git commit -m "feat: add topology type definitions and type guards

Define NetworkElement, TopologyLink, TopologyCluster, EndpointStub,
and all API response types. Add runtime type guards with tests."
```

---

### Task 3: Mock Data Generator

**Files:**
- Create: `src/mock/data-generator.ts`
- Test: `tests/unit/mock/data-generator.test.ts`

- [ ] **Step 1: Write data generator tests**

Create `tests/unit/mock/data-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateElements, generateLinks, elementsInTile } from '@/mock/data-generator'

describe('generateElements', () => {
  it('generates the requested number of elements', () => {
    const elements = generateElements(100)
    expect(elements).toHaveLength(100)
  })

  it('generates elements with valid coordinates', () => {
    const elements = generateElements(50)
    for (const el of elements) {
      expect(el.lng).toBeGreaterThanOrEqual(-180)
      expect(el.lng).toBeLessThanOrEqual(180)
      expect(el.lat).toBeGreaterThanOrEqual(-90)
      expect(el.lat).toBeLessThanOrEqual(90)
    }
  })

  it('generates elements with unique IDs', () => {
    const elements = generateElements(200)
    const ids = new Set(elements.map(e => e.id))
    expect(ids.size).toBe(200)
  })

  it('generates elements with required fields', () => {
    const elements = generateElements(1)
    const el = elements[0]
    expect(typeof el.id).toBe('string')
    expect(typeof el.type).toBe('string')
    expect(typeof el.label).toBe('string')
    expect(typeof el.version).toBe('number')
    expect(typeof el.updatedAt).toBe('string')
    expect(el.properties).toBeDefined()
  })
})

describe('generateLinks', () => {
  it('generates links between existing elements', () => {
    const elements = generateElements(20)
    const links = generateLinks(elements, 10)
    expect(links).toHaveLength(10)
    const elementIds = new Set(elements.map(e => e.id))
    for (const link of links) {
      expect(elementIds.has(link.sourceId)).toBe(true)
      expect(elementIds.has(link.targetId)).toBe(true)
    }
  })

  it('generates links with unique IDs', () => {
    const elements = generateElements(50)
    const links = generateLinks(elements, 30)
    const ids = new Set(links.map(l => l.id))
    expect(ids.size).toBe(30)
  })
})

describe('elementsInTile', () => {
  it('returns only elements within the tile bounding box', () => {
    const elements = generateElements(500)
    // Tile 0/0/0 covers the entire world
    const inTile = elementsInTile(elements, 0, 0, 0)
    expect(inTile.length).toBe(500)
  })

  it('returns a subset for a smaller tile', () => {
    const elements = generateElements(1000)
    // Zoom level 2 tile — covers 1/16 of the world
    const inTile = elementsInTile(elements, 2, 1, 1)
    expect(inTile.length).toBeLessThan(1000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/mock/data-generator.test.ts
```

Expected: FAIL — module `@/mock/data-generator` not found.

- [ ] **Step 3: Implement data generator**

Create `src/mock/data-generator.ts`:

```typescript
import type { NetworkElement, TopologyLink } from '@/types/topology'

const ELEMENT_TYPES = ['router', 'switch', 'server', 'firewall', 'access-point']

let seed = 42
function seededRandom(): number {
  seed = (seed * 16807 + 0) % 2147483647
  return (seed - 1) / 2147483646
}

export function resetSeed(s = 42): void {
  seed = s
}

export function generateElements(count: number): NetworkElement[] {
  const elements: NetworkElement[] = []
  for (let i = 0; i < count; i++) {
    const lng = seededRandom() * 360 - 180
    const lat = seededRandom() * 180 - 90
    const typeIndex = Math.floor(seededRandom() * ELEMENT_TYPES.length)
    elements.push({
      id: `el-${i}`,
      type: ELEMENT_TYPES[typeIndex],
      label: `${ELEMENT_TYPES[typeIndex]}-${i}`,
      lng,
      lat,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: { index: i },
    })
  }
  return elements
}

export function generateLinks(elements: NetworkElement[], count: number): TopologyLink[] {
  const links: TopologyLink[] = []
  for (let i = 0; i < count; i++) {
    const srcIdx = Math.floor(seededRandom() * elements.length)
    let tgtIdx = Math.floor(seededRandom() * elements.length)
    if (tgtIdx === srcIdx) tgtIdx = (tgtIdx + 1) % elements.length
    links.push({
      id: `link-${i}`,
      type: 'connection',
      sourceId: elements[srcIdx].id,
      targetId: elements[tgtIdx].id,
      directed: false,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: {},
    })
  }
  return links
}

/**
 * Convert tile coordinates to a bounding box in WGS84.
 * Uses the standard Web Mercator tile scheme (z/x/y).
 */
export function tileToBBox(z: number, x: number, y: number): { west: number; south: number; east: number; north: number } {
  const n = Math.pow(2, z)
  const west = (x / n) * 360 - 180
  const east = ((x + 1) / n) * 360 - 180
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)))
  const north = (northRad * 180) / Math.PI
  const south = (southRad * 180) / Math.PI
  return { west, south, east, north }
}

export function elementsInTile(elements: NetworkElement[], z: number, x: number, y: number): NetworkElement[] {
  const { west, south, east, north } = tileToBBox(z, x, y)
  return elements.filter(
    (el) => el.lng >= west && el.lng <= east && el.lat >= south && el.lat <= north,
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/mock/data-generator.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mock/data-generator.ts tests/unit/mock/data-generator.test.ts
git commit -m "feat: add mock data generator for topology elements and links

Generates elements with random WGS84 coordinates and links between
them. Includes tile bounding box math and spatial filtering."
```

---

### Task 4: Mock Service Worker Handlers

**Files:**
- Create: `src/mock/handlers.ts`, `src/mock/browser.ts`

- [ ] **Step 1: Create MSW request handlers**

Create `src/mock/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw'
import {
  generateElements,
  generateLinks,
  elementsInTile,
  resetSeed,
} from './data-generator'
import type { NetworkElement, TileElementsResponse, TileLinksResponse } from '@/types/topology'

// Generate a fixed dataset on module load
resetSeed(42)
const ALL_ELEMENTS = generateElements(5000)
const ALL_LINKS = generateLinks(ALL_ELEMENTS, 3000)

function linksForElements(elements: NetworkElement[]) {
  const ids = new Set(elements.map((e) => e.id))
  return ALL_LINKS.filter((l) => ids.has(l.sourceId) || ids.has(l.targetId))
}

export const handlers = [
  http.get('/api/topology/tiles/:z/:x/:y/elements', ({ params }) => {
    const z = Number(params.z)
    const x = Number(params.x)
    const y = Number(params.y)
    const elements = elementsInTile(ALL_ELEMENTS, z, x, y)
    const response: TileElementsResponse = {
      elements,
      clusters: [],
      generation: 1,
      removedIds: [],
    }
    return HttpResponse.json(response)
  }),

  http.get('/api/topology/tiles/:z/:x/:y/links', ({ params }) => {
    const z = Number(params.z)
    const x = Number(params.x)
    const y = Number(params.y)
    const tileElements = elementsInTile(ALL_ELEMENTS, z, x, y)
    const tileLinks = linksForElements(tileElements)
    const tileElementIds = new Set(tileElements.map((e) => e.id))

    // Build stubs for endpoints not in this tile
    const stubs: { id: string; lng: number; lat: number }[] = []
    const seenStubs = new Set<string>()
    for (const link of tileLinks) {
      for (const endpointId of [link.sourceId, link.targetId]) {
        if (!tileElementIds.has(endpointId) && !seenStubs.has(endpointId)) {
          const el = ALL_ELEMENTS.find((e) => e.id === endpointId)
          if (el) {
            stubs.push({ id: el.id, lng: el.lng, lat: el.lat })
            seenStubs.add(endpointId)
          }
        }
      }
    }

    const response: TileLinksResponse = {
      links: tileLinks,
      stubs,
      generation: 1,
      removedLinkIds: [],
    }
    return HttpResponse.json(response)
  }),

  http.get('/api/topology/elements/:id', ({ params }) => {
    const element = ALL_ELEMENTS.find((e) => e.id === params.id)
    if (!element) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(element)
  }),

  http.get('/api/topology/search', ({ request }) => {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const limit = Number(url.searchParams.get('limit') ?? '20')
    const results = ALL_ELEMENTS.filter(
      (e) => e.label.toLowerCase().includes(q) || e.type.toLowerCase().includes(q),
    ).slice(0, limit)
    return HttpResponse.json({ results, total: results.length })
  }),
]
```

- [ ] **Step 2: Create MSW browser worker setup**

Create `src/mock/browser.ts`:

```typescript
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
```

- [ ] **Step 3: Initialize MSW in development mode**

Update `src/main.ts` to start MSW in development:

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

async function bootstrap() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mock/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

bootstrap()
```

- [ ] **Step 4: Generate MSW service worker file**

```bash
npx msw init public/ --save
```

Expected: Creates `public/mockServiceWorker.js`.

- [ ] **Step 5: Verify MSW starts in dev mode**

```bash
npm run dev
```

Expected: Browser console shows `[MSW] Mocking enabled.`

- [ ] **Step 6: Commit**

```bash
git add src/mock/handlers.ts src/mock/browser.ts src/main.ts public/mockServiceWorker.js
git commit -m "feat: add MSW mock API for tile-based topology endpoints

Mock handlers for tile elements, tile links, element detail, and
search. 5000 elements + 3000 links generated for development."
```

---

### Task 5: API Client with Retry and Abort

**Files:**
- Create: `src/api/client.ts`
- Test: `tests/unit/api/client.test.ts`

- [ ] **Step 1: Write API client tests**

Create `tests/unit/api/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiGet } from '@/api/client'

describe('apiGet', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: 'ok' }), { status: 200 }),
    )
    const result = await apiGet<{ data: string }>('/test')
    expect(result).toEqual({ data: 'ok' })
  })

  it('throws on 4xx without retrying', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404 }),
    )
    await expect(apiGet('/not-found')).rejects.toThrow('HTTP 404')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries on 5xx up to maxRetries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const result = await apiGet<{ ok: boolean }>('/retry-test', { maxRetries: 3, baseDelayMs: 0 })
    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('aborts when signal is triggered', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(apiGet('/abort-test', { signal: controller.signal })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/api/client.test.ts
```

Expected: FAIL — module `@/api/client` not found.

- [ ] **Step 3: Implement API client**

Create `src/api/client.ts`:

```typescript
export interface ApiGetOptions {
  signal?: AbortSignal
  timeoutMs?: number
  maxRetries?: number
  baseDelayMs?: number
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiGet<T>(
  url: string,
  options: ApiGetOptions = {},
): Promise<T> {
  const {
    signal,
    timeoutMs = 10_000,
    maxRetries = 3,
    baseDelayMs = 1000,
  } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController()
    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal

    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, { signal: combinedSignal })
      clearTimeout(timeout)

      if (response.ok) {
        return (await response.json()) as T
      }

      if (response.status >= 400 && response.status < 500) {
        throw new ApiError(response.status, `HTTP ${response.status}`)
      }

      // 5xx — retry
      lastError = new ApiError(response.status, `HTTP ${response.status}`)
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof ApiError && err.status < 500) throw err
      if (signal?.aborted) throw err
      lastError = err as Error
    }

    // Wait before retry (skip on last attempt)
    if (attempt < maxRetries - 1 && baseDelayMs > 0) {
      const delay = baseDelayMs * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError ?? new Error('Request failed')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/api/client.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/unit/api/client.test.ts
git commit -m "feat: add API client with retry, timeout, and abort support

Exponential backoff retry for 5xx errors. No retry on 4xx.
10s default timeout. AbortController support for cancellation."
```

---

### Task 6: Tile Service with Generation Ordering

**Files:**
- Create: `src/api/tile-service.ts`
- Test: `tests/unit/api/tile-service.test.ts`

- [ ] **Step 1: Write tile service tests**

Create `tests/unit/api/tile-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TileService } from '@/api/tile-service'
import type { TileElementsResponse, TileLinksResponse } from '@/types/topology'

describe('TileService', () => {
  let service: TileService

  beforeEach(() => {
    service = new TileService()
    vi.restoreAllMocks()
  })

  it('fetches tile elements and returns them', async () => {
    const mockResponse: TileElementsResponse = {
      elements: [{ id: 'el-1', type: 'router', label: 'R1', lng: 10, lat: 20, version: 1, updatedAt: '', properties: {} }],
      clusters: [],
      generation: 1,
      removedIds: [],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const gen = service.nextGeneration()
    const result = await service.fetchTileElements(2, 1, 1, gen)
    expect(result).not.toBeNull()
    expect(result!.elements).toHaveLength(1)
  })

  it('discards responses from stale generations', async () => {
    const mockResponse: TileElementsResponse = {
      elements: [{ id: 'el-1', type: 'router', label: 'R1', lng: 10, lat: 20, version: 1, updatedAt: '', properties: {} }],
      clusters: [],
      generation: 1,
      removedIds: [],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const staleGen = service.nextGeneration()
    service.nextGeneration() // advance past staleGen
    const result = await service.fetchTileElements(2, 1, 1, staleGen)
    expect(result).toBeNull()
  })

  it('cancels in-flight requests on cancelAll', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}), // never resolves
    )

    const gen = service.nextGeneration()
    const promise = service.fetchTileElements(2, 1, 1, gen)
    service.cancelAll()
    expect(promise).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/api/tile-service.test.ts
```

Expected: FAIL — module `@/api/tile-service` not found.

- [ ] **Step 3: Implement tile service**

Create `src/api/tile-service.ts`:

```typescript
import { apiGet } from './client'
import type { TileElementsResponse, TileLinksResponse } from '@/types/topology'

export class TileService {
  private generation = 0
  private controllers = new Map<string, AbortController>()

  nextGeneration(): number {
    this.generation++
    return this.generation
  }

  currentGeneration(): number {
    return this.generation
  }

  private tileKey(z: number, x: number, y: number, suffix: string): string {
    return `${z}/${x}/${y}/${suffix}`
  }

  async fetchTileElements(
    z: number,
    x: number,
    y: number,
    requestGeneration: number,
  ): Promise<TileElementsResponse | null> {
    const key = this.tileKey(z, x, y, 'elements')
    this.controllers.get(key)?.abort()

    const controller = new AbortController()
    this.controllers.set(key, controller)

    try {
      const result = await apiGet<TileElementsResponse>(
        `/api/topology/tiles/${z}/${x}/${y}/elements`,
        { signal: controller.signal, maxRetries: 3, baseDelayMs: 0 },
      )

      // Discard if generation is stale
      if (requestGeneration < this.generation) return null

      return result
    } finally {
      this.controllers.delete(key)
    }
  }

  async fetchTileLinks(
    z: number,
    x: number,
    y: number,
    requestGeneration: number,
  ): Promise<TileLinksResponse | null> {
    const key = this.tileKey(z, x, y, 'links')
    this.controllers.get(key)?.abort()

    const controller = new AbortController()
    this.controllers.set(key, controller)

    try {
      const result = await apiGet<TileLinksResponse>(
        `/api/topology/tiles/${z}/${x}/${y}/links`,
        { signal: controller.signal, maxRetries: 3, baseDelayMs: 0 },
      )

      if (requestGeneration < this.generation) return null

      return result
    } finally {
      this.controllers.delete(key)
    }
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) {
      controller.abort()
    }
    this.controllers.clear()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/api/tile-service.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/tile-service.ts tests/unit/api/tile-service.test.ts
git commit -m "feat: add tile service with generation-based stale response rejection

Fetches tile elements and links with abort support. Discards responses
from superseded generations to prevent stale data injection."
```

---

### Task 7: Viewport Store

**Files:**
- Create: `src/stores/viewport.ts`
- Test: `tests/unit/stores/viewport.test.ts`

- [ ] **Step 1: Write viewport store tests**

Create `tests/unit/stores/viewport.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useViewportStore } from '@/stores/viewport'

describe('useViewportStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has default viewport state', () => {
    const store = useViewportStore()
    expect(store.zoom).toBe(2)
    expect(store.center).toEqual({ lng: 0, lat: 0 })
    expect(store.bounds).toBeNull()
  })

  it('updates bounds and zoom', () => {
    const store = useViewportStore()
    store.updateViewport({
      zoom: 10,
      center: { lng: 116.4, lat: 39.9 },
      bounds: { west: 116.0, south: 39.5, east: 117.0, north: 40.5 },
    })
    expect(store.zoom).toBe(10)
    expect(store.center.lng).toBe(116.4)
    expect(store.bounds).not.toBeNull()
  })

  it('computes visible tile coordinates', () => {
    const store = useViewportStore()
    store.updateViewport({
      zoom: 2,
      center: { lng: 0, lat: 0 },
      bounds: { west: -45, south: -45, east: 45, north: 45 },
    })
    const tiles = store.visibleTiles
    expect(tiles.length).toBeGreaterThan(0)
    for (const tile of tiles) {
      expect(tile).toHaveProperty('z')
      expect(tile).toHaveProperty('x')
      expect(tile).toHaveProperty('y')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/stores/viewport.test.ts
```

Expected: FAIL — module `@/stores/viewport` not found.

- [ ] **Step 3: Implement viewport store**

Create `src/stores/viewport.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ViewportBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface TileCoord {
  z: number
  x: number
  y: number
}

export interface ViewportUpdate {
  zoom: number
  center: { lng: number; lat: number }
  bounds: ViewportBounds | null
}

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  )
}

export const useViewportStore = defineStore('viewport', () => {
  const zoom = ref(2)
  const center = ref({ lng: 0, lat: 0 })
  const bounds = ref<ViewportBounds | null>(null)

  function updateViewport(update: ViewportUpdate) {
    zoom.value = update.zoom
    center.value = update.center
    bounds.value = update.bounds
  }

  const visibleTiles = computed<TileCoord[]>(() => {
    if (!bounds.value) return []
    const z = Math.floor(zoom.value)
    const maxTile = Math.pow(2, z) - 1

    const xMin = Math.max(0, lngToTileX(bounds.value.west, z))
    const xMax = Math.min(maxTile, lngToTileX(bounds.value.east, z))
    const yMin = Math.max(0, latToTileY(bounds.value.north, z))
    const yMax = Math.min(maxTile, latToTileY(bounds.value.south, z))

    const tiles: TileCoord[] = []
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y })
      }
    }
    return tiles
  })

  return { zoom, center, bounds, updateViewport, visibleTiles }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/stores/viewport.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/viewport.ts tests/unit/stores/viewport.test.ts
git commit -m "feat: add viewport store with tile coordinate computation

Tracks map zoom, center, bounds. Computes visible tile coordinates
from viewport bounds using Web Mercator tile math."
```

---

### Task 8: Topology Store (Graphology Working-Set Graph)

**Files:**
- Create: `src/stores/topology.ts`
- Test: `tests/unit/stores/topology.test.ts`

- [ ] **Step 1: Write topology store tests**

Create `tests/unit/stores/topology.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import type { NetworkElement, TopologyLink, TileElementsResponse, TileLinksResponse } from '@/types/topology'

function makeElement(id: string, lng = 0, lat = 0): NetworkElement {
  return { id, type: 'router', label: `R-${id}`, lng, lat, version: 1, updatedAt: '', properties: {} }
}

function makeLink(id: string, sourceId: string, targetId: string): TopologyLink {
  return { id, type: 'conn', sourceId, targetId, directed: false, version: 1, updatedAt: '', properties: {} }
}

describe('useTopologyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('merges tile elements into the graph', () => {
    const store = useTopologyStore()
    const tileKey = '2/1/1'
    const response: TileElementsResponse = {
      elements: [makeElement('a'), makeElement('b')],
      clusters: [],
      generation: 1,
      removedIds: [],
    }
    store.mergeTileElements(tileKey, response)
    expect(store.graph.order).toBe(2)
    expect(store.graph.hasNode('a')).toBe(true)
    expect(store.graph.hasNode('b')).toBe(true)
  })

  it('upserts elements with higher version', () => {
    const store = useTopologyStore()
    const tileKey = '2/1/1'
    store.mergeTileElements(tileKey, {
      elements: [makeElement('a')],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    expect(store.graph.getNodeAttribute('a', 'label')).toBe('R-a')

    const updatedEl = { ...makeElement('a'), label: 'Updated', version: 2 }
    store.mergeTileElements(tileKey, {
      elements: [updatedEl],
      clusters: [],
      generation: 2,
      removedIds: [],
    })
    expect(store.graph.getNodeAttribute('a', 'label')).toBe('Updated')
  })

  it('removes elements listed in removedIds', () => {
    const store = useTopologyStore()
    const tileKey = '2/1/1'
    store.mergeTileElements(tileKey, {
      elements: [makeElement('a'), makeElement('b')],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    store.mergeTileElements(tileKey, {
      elements: [],
      clusters: [],
      generation: 2,
      removedIds: ['a'],
    })
    expect(store.graph.hasNode('a')).toBe(false)
    expect(store.graph.hasNode('b')).toBe(true)
  })

  it('does NOT remove elements merely absent from a tile response', () => {
    const store = useTopologyStore()
    const tileKey = '2/1/1'
    store.mergeTileElements(tileKey, {
      elements: [makeElement('a'), makeElement('b')],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    // Re-fetch same tile with only 'b' — 'a' is absent but NOT in removedIds
    store.mergeTileElements(tileKey, {
      elements: [makeElement('b')],
      clusters: [],
      generation: 2,
      removedIds: [],
    })
    expect(store.graph.hasNode('a')).toBe(true)
  })

  it('merges tile links with tile reference counting', () => {
    const store = useTopologyStore()
    // Add elements first
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a'), makeElement('b')],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    store.mergeTileLinks('2/1/1', {
      links: [makeLink('l1', 'a', 'b')],
      stubs: [],
      generation: 1,
      removedLinkIds: [],
    })
    expect(store.graph.size).toBe(1)
    expect(store.graph.hasEdge('l1')).toBe(true)
  })

  it('evicts tile data while preserving graph integrity', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a')],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    store.mergeTileElements('2/1/2', {
      elements: [makeElement('b')],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    expect(store.graph.order).toBe(2)

    store.evictTile('2/1/1')
    expect(store.graph.hasNode('a')).toBe(false)
    expect(store.graph.hasNode('b')).toBe(true)
  })

  it('does not evict elements present in multiple tiles', () => {
    const store = useTopologyStore()
    store.mergeTileElements('2/1/1', {
      elements: [makeElement('a')],
      clusters: [],
      generation: 1,
      removedIds: [],
    })
    store.mergeTileElements('2/1/2', {
      elements: [makeElement('a')],
      clusters: [],
      generation: 1,
      removedIds: [],
    })

    store.evictTile('2/1/1')
    expect(store.graph.hasNode('a')).toBe(true) // still in tile 2/1/2
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/stores/topology.test.ts
```

Expected: FAIL — module `@/stores/topology` not found.

- [ ] **Step 3: Implement topology store**

Create `src/stores/topology.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import Graph from 'graphology'
import type {
  NetworkElement,
  TopologyLink,
  TileElementsResponse,
  TileLinksResponse,
} from '@/types/topology'

export const useTopologyStore = defineStore('topology', () => {
  const graph = ref(new Graph({ multi: false, type: 'mixed' }))

  // Track which tiles each node/edge belongs to
  const nodeTileRefs = ref(new Map<string, Set<string>>())
  const edgeTileRefs = ref(new Map<string, Set<string>>())

  // Track tile generations for staleness
  const tileGenerations = ref(new Map<string, number>())

  const nodeCount = computed(() => graph.value.order)
  const edgeCount = computed(() => graph.value.size)

  function mergeTileElements(tileKey: string, response: TileElementsResponse) {
    tileGenerations.value.set(tileKey, response.generation)

    // Process removedIds — explicit backend deletions
    for (const id of response.removedIds) {
      if (graph.value.hasNode(id)) {
        graph.value.dropNode(id)
      }
      nodeTileRefs.value.delete(id)
    }

    // Upsert elements
    for (const el of response.elements) {
      if (graph.value.hasNode(el.id)) {
        const currentVersion = graph.value.getNodeAttribute(el.id, 'version') as number
        if (el.version > currentVersion) {
          graph.value.replaceNodeAttributes(el.id, { ...el })
        }
      } else {
        graph.value.addNode(el.id, { ...el })
      }

      // Update tile refs
      if (!nodeTileRefs.value.has(el.id)) {
        nodeTileRefs.value.set(el.id, new Set())
      }
      nodeTileRefs.value.get(el.id)!.add(tileKey)
    }
  }

  function mergeTileLinks(tileKey: string, response: TileLinksResponse) {
    // Process removedLinkIds
    for (const id of response.removedLinkIds) {
      if (graph.value.hasEdge(id)) {
        graph.value.dropEdge(id)
      }
      edgeTileRefs.value.delete(id)
    }

    // Upsert links (only if both endpoints exist in graph)
    for (const link of response.links) {
      const srcExists = graph.value.hasNode(link.sourceId)
      const tgtExists = graph.value.hasNode(link.targetId)

      // Add stub nodes for endpoints not yet in the graph
      for (const stub of response.stubs) {
        if (!graph.value.hasNode(stub.id)) {
          graph.value.addNode(stub.id, {
            id: stub.id,
            type: '__stub__',
            label: '',
            lng: stub.lng,
            lat: stub.lat,
            version: 0,
            updatedAt: '',
            properties: {},
            isStub: true,
          })
        }
      }

      if (!graph.value.hasNode(link.sourceId) || !graph.value.hasNode(link.targetId)) {
        continue
      }

      if (graph.value.hasEdge(link.id)) {
        const currentVersion = graph.value.getEdgeAttribute(link.id, 'version') as number
        if (link.version > currentVersion) {
          graph.value.replaceEdgeAttributes(link.id, { ...link })
        }
      } else {
        const edgeType = link.directed ? 'directed' : 'undirected'
        graph.value.addEdgeWithKey(link.id, link.sourceId, link.targetId, { ...link, edgeType })
      }

      if (!edgeTileRefs.value.has(link.id)) {
        edgeTileRefs.value.set(link.id, new Set())
      }
      edgeTileRefs.value.get(link.id)!.add(tileKey)
    }
  }

  function evictTile(tileKey: string) {
    tileGenerations.value.delete(tileKey)

    // Remove edges owned only by this tile
    for (const [edgeId, tiles] of edgeTileRefs.value) {
      tiles.delete(tileKey)
      if (tiles.size === 0) {
        if (graph.value.hasEdge(edgeId)) {
          graph.value.dropEdge(edgeId)
        }
        edgeTileRefs.value.delete(edgeId)
      }
    }

    // Remove nodes owned only by this tile
    for (const [nodeId, tiles] of nodeTileRefs.value) {
      tiles.delete(tileKey)
      if (tiles.size === 0) {
        if (graph.value.hasNode(nodeId)) {
          graph.value.dropNode(nodeId)
        }
        nodeTileRefs.value.delete(nodeId)
      }
    }
  }

  function getElement(id: string): NetworkElement | null {
    if (!graph.value.hasNode(id)) return null
    return graph.value.getNodeAttributes(id) as unknown as NetworkElement
  }

  function clear() {
    graph.value.clear()
    nodeTileRefs.value.clear()
    edgeTileRefs.value.clear()
    tileGenerations.value.clear()
  }

  return {
    graph,
    nodeTileRefs,
    edgeTileRefs,
    tileGenerations,
    nodeCount,
    edgeCount,
    mergeTileElements,
    mergeTileLinks,
    evictTile,
    getElement,
    clear,
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/stores/topology.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/topology.ts tests/unit/stores/topology.test.ts
git commit -m "feat: add topology store with Graphology working-set graph

Tile-based merge with version upsert, explicit deletion via removedIds,
tile reference counting for nodes and edges, and safe tile eviction."
```

---

### Task 9: Selection Store

**Files:**
- Create: `src/stores/selection.ts`
- Test: `tests/unit/stores/selection.test.ts`

- [ ] **Step 1: Write selection store tests**

Create `tests/unit/stores/selection.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSelectionStore } from '@/stores/selection'

describe('useSelectionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('selects a single element', () => {
    const store = useSelectionStore()
    store.selectElement('el-1')
    expect(store.selectedIds).toEqual(new Set(['el-1']))
    expect(store.primarySelectedId).toBe('el-1')
  })

  it('toggles selection with ctrl-click', () => {
    const store = useSelectionStore()
    store.selectElement('el-1')
    store.toggleElement('el-2')
    expect(store.selectedIds.size).toBe(2)
    store.toggleElement('el-1')
    expect(store.selectedIds.size).toBe(1)
    expect(store.selectedIds.has('el-2')).toBe(true)
  })

  it('clears selection', () => {
    const store = useSelectionStore()
    store.selectElement('el-1')
    store.toggleElement('el-2')
    store.clearSelection()
    expect(store.selectedIds.size).toBe(0)
    expect(store.primarySelectedId).toBeNull()
  })

  it('caps selection at 500 elements', () => {
    const store = useSelectionStore()
    for (let i = 0; i < 510; i++) {
      store.toggleElement(`el-${i}`)
    }
    expect(store.selectedIds.size).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/stores/selection.test.ts
```

Expected: FAIL — module `@/stores/selection` not found.

- [ ] **Step 3: Implement selection store**

Create `src/stores/selection.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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
        primarySelectedId.value = next.size > 0 ? [...next][next.size - 1] : null
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
    primarySelectedId.value = next.size > 0 ? ids[0] : null
  }

  function clearSelection() {
    selectedIds.value = new Set()
    primarySelectedId.value = null
  }

  const hasSelection = computed(() => selectedIds.value.size > 0)

  return {
    selectedIds,
    primarySelectedId,
    hasSelection,
    selectElement,
    toggleElement,
    selectMany,
    clearSelection,
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/stores/selection.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/selection.ts tests/unit/stores/selection.test.ts
git commit -m "feat: add selection store with 500-element cap

Single select, toggle (ctrl-click), multi-select, and clear.
Enforces max selection limit to prevent excessive layer updates."
```

---

### Task 10: Tile Loader Composable

**Files:**
- Create: `src/composables/use-tile-loader.ts`
- Test: `tests/unit/composables/use-tile-loader.test.ts`

- [ ] **Step 1: Write tile loader tests**

Create `tests/unit/composables/use-tile-loader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { bboxToTiles } from '@/composables/use-tile-loader'

describe('bboxToTiles', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns tiles covering a bounding box', () => {
    const tiles = bboxToTiles(
      { west: -10, south: -10, east: 10, north: 10 },
      3,
    )
    expect(tiles.length).toBeGreaterThan(0)
    for (const t of tiles) {
      expect(t.z).toBe(3)
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns a single tile at zoom 0', () => {
    const tiles = bboxToTiles(
      { west: -180, south: -85, east: 180, north: 85 },
      0,
    )
    expect(tiles).toEqual([{ z: 0, x: 0, y: 0 }])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/composables/use-tile-loader.test.ts
```

Expected: FAIL — module `@/composables/use-tile-loader` not found.

- [ ] **Step 3: Implement tile loader composable**

Create `src/composables/use-tile-loader.ts`:

```typescript
import { watch } from 'vue'
import { useViewportStore, type ViewportBounds, type TileCoord } from '@/stores/viewport'
import { useTopologyStore } from '@/stores/topology'
import { TileService } from '@/api/tile-service'

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
  const tileService = new TileService()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const loadedTiles = new Set<string>()

  async function loadTile(tile: TileCoord) {
    const tileKey = `${tile.z}/${tile.x}/${tile.y}`
    const gen = tileService.nextGeneration()

    const [elemResponse, linkResponse] = await Promise.all([
      tileService.fetchTileElements(tile.z, tile.x, tile.y, gen),
      tileService.fetchTileLinks(tile.z, tile.x, tile.y, gen),
    ])

    if (elemResponse) {
      topologyStore.mergeTileElements(tileKey, elemResponse)
    }
    if (linkResponse) {
      topologyStore.mergeTileLinks(tileKey, linkResponse)
    }

    loadedTiles.add(tileKey)
  }

  function loadVisibleTiles() {
    if (!viewportStore.bounds) return

    tileService.cancelAll()

    const tiles = viewportStore.visibleTiles
    const newTileKeys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`))

    // Evict tiles no longer visible
    for (const loaded of loadedTiles) {
      if (!newTileKeys.has(loaded)) {
        topologyStore.evictTile(loaded)
        loadedTiles.delete(loaded)
      }
    }

    // Load new tiles
    const tilesToLoad = tiles.filter((t) => !loadedTiles.has(`${t.z}/${t.x}/${t.y}`))
    for (const tile of tilesToLoad) {
      loadTile(tile).catch(() => {
        // Silently handle failed tiles — partial load is acceptable
      })
    }
  }

  function onViewportChange() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(loadVisibleTiles, 200)
  }

  watch(
    () => [viewportStore.bounds, viewportStore.zoom],
    onViewportChange,
    { deep: true },
  )

  return { loadVisibleTiles, loadedTiles }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/composables/use-tile-loader.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/use-tile-loader.ts tests/unit/composables/use-tile-loader.test.ts
git commit -m "feat: add tile loader composable with debounced viewport-driven fetching

Converts viewport bounds to tile coordinates, loads tiles in parallel,
evicts tiles no longer visible. 200ms debounce on viewport changes."
```

---

### Task 11: Deck.gl Layer Composable

**Files:**
- Create: `src/composables/use-deck-layers.ts`

- [ ] **Step 1: Implement Deck.gl layer builder**

Create `src/composables/use-deck-layers.ts`:

```typescript
import { computed } from 'vue'
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'
import type { NetworkElement, TopologyLink } from '@/types/topology'

export function useDeckLayers(onElementClick: (id: string) => void, onElementHover: (id: string | null) => void) {
  const topologyStore = useTopologyStore()
  const selectionStore = useSelectionStore()

  const layers = computed(() => {
    const nodes: (NetworkElement & { isStub?: boolean })[] = []
    const edges: { source: NetworkElement; target: NetworkElement; link: TopologyLink }[] = []

    topologyStore.graph.forEachNode((id, attrs) => {
      nodes.push(attrs as NetworkElement & { isStub?: boolean })
    })

    topologyStore.graph.forEachEdge((id, attrs, source, target, sourceAttrs, targetAttrs) => {
      edges.push({
        source: sourceAttrs as unknown as NetworkElement,
        target: targetAttrs as unknown as NetworkElement,
        link: attrs as unknown as TopologyLink,
      })
    })

    const nodeLayer = new ScatterplotLayer({
      id: 'nodes',
      data: nodes,
      getPosition: (d: NetworkElement) => [d.lng, d.lat],
      getRadius: (d: NetworkElement & { isStub?: boolean }) => d.isStub ? 3 : 6,
      getFillColor: (d: NetworkElement & { isStub?: boolean }) => {
        if (d.isStub) return [150, 150, 150, 100]
        if (selectionStore.selectedIds.has(d.id)) return [255, 140, 0, 255]
        return [0, 128, 255, 200]
      },
      radiusUnits: 'pixels',
      pickable: true,
      onClick: (info: { object?: NetworkElement }) => {
        if (info.object) onElementClick(info.object.id)
      },
      onHover: (info: { object?: NetworkElement }) => {
        onElementHover(info.object?.id ?? null)
      },
      updateTriggers: {
        getFillColor: [selectionStore.selectedIds],
      },
    })

    const linkLayer = new LineLayer({
      id: 'links',
      data: edges,
      getSourcePosition: (d: { source: NetworkElement }) => [d.source.lng, d.source.lat],
      getTargetPosition: (d: { target: NetworkElement }) => [d.target.lng, d.target.lat],
      getColor: (d: { source: NetworkElement & { isStub?: boolean }; target: NetworkElement & { isStub?: boolean } }) => {
        if (d.source.isStub || d.target.isStub) return [150, 150, 150, 80]
        return [100, 100, 100, 160]
      },
      getWidth: 1,
      widthUnits: 'pixels',
    })

    return [linkLayer, nodeLayer]
  })

  return { layers }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/use-deck-layers.ts
git commit -m "feat: add Deck.gl layer composable for node and link rendering

Builds ScatterplotLayer for nodes and LineLayer for links from
Graphology graph data. Supports selection highlighting, stub
rendering, click, and hover callbacks."
```

---

### Task 12: MapView Component (Mapbox + Deck.gl)

**Files:**
- Create: `src/components/MapView.vue`

- [ ] **Step 1: Implement the MapView component**

Create `src/components/MapView.vue`:

```vue
<template>
  <div ref="containerRef" class="map-view">
    <div ref="mapRef" class="map-container" />
    <canvas ref="deckRef" class="deck-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Deck } from '@deck.gl/core'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { useViewportStore } from '@/stores/viewport'
import { useSelectionStore } from '@/stores/selection'
import { useTileLoader } from '@/composables/use-tile-loader'
import { useDeckLayers } from '@/composables/use-deck-layers'

const emit = defineEmits<{
  elementClick: [id: string]
  elementHover: [id: string | null]
}>()

const containerRef = ref<HTMLElement | null>(null)
const mapRef = ref<HTMLElement | null>(null)

const viewportStore = useViewportStore()
const selectionStore = useSelectionStore()

let map: mapboxgl.Map | null = null
let overlay: MapboxOverlay | null = null

const hoveredId = ref<string | null>(null)

function handleClick(id: string) {
  selectionStore.selectElement(id)
  emit('elementClick', id)
}

function handleHover(id: string | null) {
  hoveredId.value = id
  emit('elementHover', id)
}

const { layers } = useDeckLayers(handleClick, handleHover)
const { loadVisibleTiles } = useTileLoader()

function syncViewport() {
  if (!map) return
  const bounds = map.getBounds()
  const center = map.getCenter()
  viewportStore.updateViewport({
    zoom: map.getZoom(),
    center: { lng: center.lng, lat: center.lat },
    bounds: {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    },
  })
}

onMounted(() => {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) {
    console.error('VITE_MAPBOX_TOKEN is not set. Add it to .env')
    return
  }
  mapboxgl.accessToken = token

  map = new mapboxgl.Map({
    container: mapRef.value!,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [0, 0],
    zoom: 2,
  })

  overlay = new MapboxOverlay({
    interleaved: false,
    layers: layers.value,
  })

  map.addControl(overlay as unknown as mapboxgl.IControl)
  map.addControl(new mapboxgl.NavigationControl(), 'top-right')

  map.on('moveend', syncViewport)
  map.on('load', () => {
    syncViewport()
    loadVisibleTiles()
  })

  watch(layers, (newLayers) => {
    overlay?.setProps({ layers: newLayers })
  })
})

onUnmounted(() => {
  map?.remove()
  map = null
  overlay = null
})
</script>

<style scoped>
.map-view {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  position: absolute;
  inset: 0;
}

.deck-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
```

- [ ] **Step 2: Verify it renders in the browser**

```bash
npm run dev
```

Expected: Map loads with dark style. Console shows MSW enabled. Moving the map triggers tile fetches (visible in Network tab).

- [ ] **Step 3: Commit**

```bash
git add src/components/MapView.vue
git commit -m "feat: add MapView component with Mapbox GL JS + Deck.gl overlay

Renders base map with Deck.gl node and link layers. Syncs viewport
state to Pinia store on move. Triggers tile loading on viewport change."
```

---

### Task 13: Side Panel Component

**Files:**
- Create: `src/components/SidePanel.vue`

- [ ] **Step 1: Implement the SidePanel component**

Create `src/components/SidePanel.vue`:

```vue
<template>
  <aside class="side-panel" :class="{ open: selectionStore.hasSelection }">
    <div v-if="element" class="panel-content">
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
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { useSelectionStore } from '@/stores/selection'

const topologyStore = useTopologyStore()
const selectionStore = useSelectionStore()

const element = computed(() => {
  if (!selectionStore.primarySelectedId) return null
  return topologyStore.getElement(selectionStore.primarySelectedId)
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
}

.side-panel.open {
  transform: translateX(0);
}

.panel-content {
  padding: 16px;
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
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SidePanel.vue
git commit -m "feat: add SidePanel component for element detail inspection

Slides in from left when an element is selected. Displays all
element fields and custom properties in a detail list."
```

---

### Task 14: Toolbar and Status Bar Components

**Files:**
- Create: `src/components/TopToolbar.vue`, `src/components/StatusBar.vue`

- [ ] **Step 1: Implement TopToolbar**

Create `src/components/TopToolbar.vue`:

```vue
<template>
  <header class="toolbar">
    <div class="toolbar-title">GIS Topology Viewer</div>
    <div class="toolbar-spacer" />
  </header>
</template>

<script setup lang="ts">
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
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

.toolbar-spacer {
  flex: 1;
}
</style>
```

- [ ] **Step 2: Implement StatusBar**

Create `src/components/StatusBar.vue`:

```vue
<template>
  <footer class="status-bar">
    <span>Elements: {{ topologyStore.nodeCount }}</span>
    <span>Links: {{ topologyStore.edgeCount }}</span>
    <span>Zoom: {{ viewportStore.zoom.toFixed(1) }}</span>
  </footer>
</template>

<script setup lang="ts">
import { useTopologyStore } from '@/stores/topology'
import { useViewportStore } from '@/stores/viewport'

const topologyStore = useTopologyStore()
const viewportStore = useViewportStore()
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
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TopToolbar.vue src/components/StatusBar.vue
git commit -m "feat: add TopToolbar and StatusBar components

Toolbar shows app title (placeholder for search/filter controls).
StatusBar shows live element count, link count, and zoom level."
```

---

### Task 15: Assemble TopologyView Layout

**Files:**
- Modify: `src/views/TopologyView.vue`

- [ ] **Step 1: Wire up all components in TopologyView**

Replace `src/views/TopologyView.vue`:

```vue
<template>
  <div class="topology-view">
    <TopToolbar />
    <div class="main-area">
      <SidePanel />
      <MapView
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
import SidePanel from '@/components/SidePanel.vue'
import StatusBar from '@/components/StatusBar.vue'

function onElementClick(id: string) {
  // Selection is handled inside MapView via the selection store
}

function onElementHover(id: string | null) {
  // Future: tooltip rendering
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

- [ ] **Step 2: Reset global styles**

Add to `src/main.ts` (before `bootstrap()` call) or create `src/assets/global.css` and import it:

Create `src/assets/global.css`:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

Update `src/main.ts` to import the global styles:

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/global.css'

async function bootstrap() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mock/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

bootstrap()
```

- [ ] **Step 3: Verify the full layout in the browser**

```bash
npm run dev
```

Expected: Full-screen app with toolbar at top, map filling the center, status bar at bottom. Status bar shows element/link counts updating as map loads. Clicking an element opens the side panel with details.

- [ ] **Step 4: Commit**

```bash
git add src/views/TopologyView.vue src/assets/global.css src/main.ts
git commit -m "feat: assemble TopologyView with toolbar, map, side panel, and status bar

Full-screen layout: TopToolbar (48px) + MapView (flex) + StatusBar (28px).
SidePanel slides in on element selection. Global styles reset box model."
```

---

### Task 16: End-to-End Smoke Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```

Expected: All tests pass (types, data generator, API client, tile service, stores, composables).

- [ ] **Step 2: Run the dev server and verify manually**

```bash
npm run dev
```

Verify:
1. Map renders with dark style
2. Console shows `[MSW] Mocking enabled.`
3. Panning/zooming the map loads elements (blue dots appear)
4. Links render as lines between elements
5. Status bar updates with element/link counts
6. Clicking an element highlights it (orange) and opens the side panel
7. Side panel shows element ID, type, label, coordinates, properties
8. Closing the side panel deselects the element

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit any fixes if needed, then tag MVP**

```bash
git tag v0.1.0-mvp
```
