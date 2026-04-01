# High-Performance Web GIS Topology Viewer — Design Spec

A high-performance web GIS topology application for visualizing up to 1,000,000 network elements and their links with scalable rendering, smooth interaction, and large-scale topology exploration.

## Overview

- **Domain:** General-purpose, domain-agnostic network topology viewer
- **Views:** Dual-view — geographic map view + switchable schematic/logical view
- **Data source:** REST API (viewport-based fetching)
- **Deployment:** Standalone SPA

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Vue 3 + TypeScript |
| Build | Vite |
| Geographic map | Mapbox GL JS |
| WebGL rendering | Deck.gl (`@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/mapbox`) |
| Graph data structure | Graphology |
| Schematic layout | d3-force (in Web Worker) |
| State management | Pinia |
| Routing | vue-router |

## Project Structure

```
src/
  api/            # REST client, data fetching, types
  components/     # Vue components (panels, toolbars, dialogs)
  composables/    # Vue composables (useTopology, useSearch, useViewport)
  layers/         # Deck.gl custom layers (nodes, links, clusters)
  layout/         # Graph layout engines (force, hierarchical)
  stores/         # Pinia stores (topology, viewport, selection)
  types/          # TypeScript type definitions
  utils/          # Helpers (spatial indexing, culling, LOD)
  workers/        # Web Workers (layout computation, data processing)
  views/          # Page-level components
  App.vue
  main.ts
```

## Data Model

All coordinates use **WGS84 (EPSG:4326)**. Longitude values are normalized to [-180, 180]. Bounding box queries crossing the antimeridian are split into two sub-queries.

### Network Element (Node)

```typescript
interface NetworkElement {
  id: string
  type: string              // user-defined category
  label: string
  lng: number               // geographic longitude (WGS84, -180 to 180)
  lat: number               // geographic latitude (WGS84, -90 to 90)
  version: number           // server-side version for conflict detection
  updatedAt: string         // ISO 8601 timestamp
  properties: Record<string, unknown>  // arbitrary domain properties
}
```

### Link (Edge)

```typescript
interface TopologyLink {
  id: string
  type: string
  sourceId: string
  targetId: string
  directed: boolean         // whether the link is directional
  weight?: number           // optional weight/capacity
  status?: string           // optional status indicator
  version: number
  updatedAt: string
  properties: Record<string, unknown>
}
```

### Cluster

```typescript
interface TopologyCluster {
  id: string                // stable cluster ID (deterministic from tile + zoom)
  centroidLng: number
  centroidLat: number
  count: number             // number of elements in this cluster
  childIds?: string[]       // IDs of direct children (clusters or elements)
  elementTypes: Record<string, number>  // breakdown by type
}
```

### In-Memory Storage

Graphology `Graph` instance as the **client working-set graph** (the backend is authoritative). The graph holds only the elements relevant to the current viewport, selection, and exploration state. See [Client Data Lifecycle](#client-data-lifecycle) for caching and eviction semantics.

Capabilities:
- O(1) node/edge lookup by ID
- Efficient neighbor traversal for topology exploration
- Built-in support for filtering, iteration, and export

## REST API Contract

The API uses a **tile-based contract** (`z/x/y` scheme) for spatial queries. The backend is responsible for spatial indexing, clustering, and search. The frontend requests only what is needed for the current viewport and zoom.

### Endpoints

```
GET /api/topology/tiles/{z}/{x}/{y}/elements
  -> returns elements within the tile, clustered if zoom < 12
  Response: { elements: NetworkElement[], clusters: TopologyCluster[], generation: number, removedIds: string[] }

GET /api/topology/tiles/{z}/{x}/{y}/links
  -> returns links where at least one endpoint is within the tile
  -> includes stub endpoint data (id, lng, lat) for dangling endpoints
  Response: { links: TopologyLink[], stubs: { id: string, lng: number, lat: number }[], generation: number, removedLinkIds: string[] }

GET /api/topology/elements/{id}
  -> returns single element with full details
  Response: NetworkElement

GET /api/topology/elements/{id}/neighbors?depth={n}
  -> returns connected elements up to n hops (default 1)
  Response: { elements: NetworkElement[], links: TopologyLink[] }

GET /api/topology/clusters/{id}/children
  -> returns children of a cluster (sub-clusters or elements)
  Response: { elements: NetworkElement[], clusters: TopologyCluster[] }

GET /api/topology/search?q={query}&limit={n}&types={csv}
  -> returns matching elements across full dataset
  Response: { results: NetworkElement[], total: number }
```

### Link Boundary Semantics

Links are returned if **at least one endpoint** is within the requested tile. For links where one endpoint is outside the tile, the response includes a `stubs` array with minimal position data for the missing endpoints. This allows rendering the link without fetching the full element. The frontend renders these as lines fading to the viewport edge.

## Rendering Architecture

### Dual-View Rendering

| Concern | Geographic View | Schematic View |
|---|---|---|
| Base layer | Mapbox GL JS map tiles | Plain background (OrthographicView) |
| Node rendering | Deck.gl `ScatterplotLayer` / `IconLayer` | Deck.gl `ScatterplotLayer` with layout positions |
| Link rendering | Deck.gl `LineLayer` / `ArcLayer` | Deck.gl `LineLayer` with layout positions |
| Cluster rendering | Deck.gl `ScatterplotLayer` with size encoding | Aggregated super-nodes |
| Coordinates | lng/lat from data | x/y computed by layout engine |

### Scalability Strategy (Viewport + LOD)

1. **Viewport-based loading:** On pan/zoom, compute the visible bounding box and fetch only elements within it from the REST API. Debounce requests (200ms) to avoid excessive API calls during continuous interaction.

2. **Level-of-detail clustering:** The backend returns clustered data at low zoom levels (e.g., zoom < 12 returns clusters, zoom >= 12 returns individual elements). The frontend renders clusters as sized circles with count labels, expanding to individual nodes as the user zooms in.

3. **GPU instancing:** Deck.gl uses WebGL instanced rendering by default — each layer draws all its elements in a single draw call, regardless of count. This makes 100K+ visible elements feasible at 60fps.

4. **Frustum culling:** Deck.gl automatically skips rendering for elements outside the viewport. Combined with viewport-based loading, the app never holds or renders more data than needed.

### Memory Management

- Rolling LRU cache of recently fetched viewport tiles, capped at ~200K elements in memory. Tiles far from the current viewport are evicted.
- For schematic view, layout is computed incrementally via Web Worker — only the visible subgraph is laid out, not all 1M elements.

## Client Data Lifecycle

### Tile-Based Caching

- **Cache key:** `tile:{z}/{x}/{y}:filters:{hash}:version:{v}` where filter hash is a deterministic hash of active filter params.
- **Merge semantics:** Elements are upserted by ID into the Graphology working-set graph. If the server returns an element with a higher `version`, the local copy is replaced.
- **Deletion semantics:** Elements are only removed from the working-set graph when the backend explicitly declares deletion via `removedIds` in the tile response. Absence from a tile response does **not** imply deletion — elements may be absent due to clustering transitions, filter changes, or tile-boundary shifts. The backend includes a per-tile `generation` number and a `removedIds` array listing elements that were deleted since the client's last known generation for that tile.
- **Eviction:** LRU eviction by tile. When evicting a tile, its elements are removed from the graph unless they are pinned (see [Pinned Data Limits](#pinned-data-limits)). Evicted data can always be re-fetched.
- **In-flight request management:** All viewport-triggered fetches use `AbortController`. When viewport changes, in-flight requests for tiles no longer needed are cancelled before issuing new ones.

### Request Generation Ordering

Each viewport/filter state change increments a monotonic **request generation** counter on the client. Every outgoing tile request is tagged with its generation. When a response arrives:

1. If the response's generation is older than the current generation, **discard it** — the viewport or filters have moved on.
2. If the response's generation matches the current generation, **apply it** to the working-set graph.
3. Retries inherit the generation of the original request. If the generation has been superseded by the time the retry resolves, the retry response is discarded.

This prevents stale data injection from late-arriving or retried requests under poor network conditions.

### Link Deduplication & Garbage Collection

Links can appear in multiple tile responses (when endpoints span tiles). The working-set graph handles this as follows:

- **Upsert by ID:** Links are globally upserted by ID. Duplicate link data from overlapping tiles is merged (higher version wins).
- **Tile reference counting:** Each link tracks which tiles contributed it (a set of tile keys). When a tile is evicted, its tile key is removed from each link's reference set. A link is removed from the graph only when its reference set is empty and it is not pinned.
- **Stub replacement:** When a link is first loaded with a stub endpoint, the stub is replaced with the full element data if/when the endpoint's tile is loaded. Stubs are rendered as faded lines; full endpoints render normally.
- **Dangling edge cleanup:** On tile eviction, if a link loses all its tile references and neither endpoint is in the working-set graph, the link is removed.

### Graphology as Working-Set Graph

Graphology is the **client working-set graph**, not a full source of truth. The backend is authoritative. The working-set graph contains only the elements currently relevant to the user's viewport, selection, and exploration state. Eviction removes data from this graph — it can always be re-fetched from the backend.

### Staleness Handling

- On re-fetch of a tile, compare returned element versions with cached versions. Update stale entries. Process `removedIds` to delete elements confirmed deleted by the backend.
- If a selected element is re-fetched with changes, update the detail panel reactively.
- If a selected element appears in `removedIds` (confirmed deleted server-side), show a "no longer available" indicator and clear the selection.

### Pinned Data Limits

Pinned elements (selection, breadcrumb trail, expanded neighbors) are exempt from tile-based eviction, but subject to hard limits to prevent unbounded memory growth:

| Pinned Category | Hard Limit | Overflow Behavior |
|---|---|---|
| Selection | 500 elements | Oldest selections demoted first |
| Breadcrumb trail | 50 entries | Oldest breadcrumbs dropped (FIFO) |
| Expanded neighbors | 2,000 elements | Further expansion disabled; UI shows "memory limit reached — zoom in or clear exploration history" |
| Total pinned (all categories) | 5,000 elements | Enforce by demoting oldest pins across categories |

**Memory pressure detection:** Monitor `performance.memory.usedJSHeapSize` (Chrome) or estimate from element count. When heap exceeds 1.0 GB (warning threshold, below the 1.2 GB hard target):
1. Aggressively evict non-adjacent tiles (keep only the 3x3 tile grid around the viewport center).
2. Reduce pinned limits by 50%.
3. Disable further neighbor expansion until heap drops below 800 MB.

## User Interface

### Layout

```
+--------------------------------------------------+
|  Toolbar (view toggle, search, zoom controls)    |
+--------+-----------------------------------------+
|        |                                         |
| Side   |          Map / Schematic View            |
| Panel  |                                         |
|        |                                         |
| - tree |                                         |
| - info |                                         |
| - list |                                         |
|        |                                         |
+--------+-----------------------------------------+
|  Status bar (element count, viewport info)       |
+--------------------------------------------------+
```

### Core Interactions

- **Pan & zoom:** Smooth inertial panning, scroll-to-zoom, pinch-to-zoom on touch devices
- **Hover:** Highlight element + tooltip showing label, type, and key properties
- **Click:** Select element, show full details in side panel, highlight connected links and neighbors
- **Multi-select:** Ctrl+click to add to selection, drag-box to select a region
- **Drag to reposition:** In schematic view, drag selected nodes to reposition. Updated positions are stored client-side only (not persisted to backend).
- **View toggle:** Switch between geographic and schematic views. Visible elements carry over — schematic view runs layout on the current viewport's elements.

### Interaction Degradation Rules

To maintain performance at high element counts, interactions degrade gracefully:

| Visible Elements | Degradation |
|---|---|
| < 10K | Full interactions: hover tooltips, highlight neighbors, drag reposition |
| 10K - 50K | Disable hover tooltips (show on click only), simplify neighbor highlighting to direct connections only |
| 50K - 100K | Disable individual element hover/pick — interaction only with clusters. Drag-box select uses server-side spatial query |
| > 100K | Cluster-only interaction. Individual elements visible but not pickable until user zooms in past the 50K threshold |

Selection is capped at 500 elements to prevent excessive highlight layer updates.

### Side Panel Modes

- **Element detail:** Properties of the selected element and its connected neighbors
- **Search results:** List of matching elements with click-to-navigate
- **Filter controls:** Checkboxes/dropdowns for type and property filtering

## Search, Filtering & Topology Exploration

### Search

- Full-text search across all 1M elements via backend `GET /api/topology/search?q={query}&limit={n}`
- Debounced input (300ms) to avoid excessive API calls while typing
- Results displayed in side panel as a scrollable list
- Click a result to fly-to its location on the map (animated viewport transition)
- Matching elements highlighted on the current view if visible in the viewport

### Filtering

- Client-side filtering on cached/visible elements for instant response
- Filter criteria also sent as query params on subsequent viewport fetches so the backend returns only matching data
- Filter by element type (multi-select checkboxes) and arbitrary property values (dynamic dropdowns based on available properties)
- Active filters shown as removable chips in the toolbar

### Topology Exploration

- Click a node to see its direct neighbors highlighted (1-hop)
- "Expand neighbors" action in the detail panel fetches and displays connected elements not yet loaded, via `GET /api/topology/elements/{id}/neighbors`
- In schematic view, expanding neighbors triggers incremental layout — new nodes are positioned relative to the selected node without disrupting the existing layout
- Breadcrumb trail tracks exploration path, allowing users to step back

## Performance Budget

Targets measured on a mid-range laptop (8GB RAM, integrated GPU, Chrome):

| Metric | Target (p95) |
|---|---|
| Frame time at < 50K visible elements | < 20ms (50+ fps) |
| Frame time at 50K-100K visible elements | < 33ms (30+ fps) |
| Time to first meaningful paint | < 2.5s |
| Search response (backend + render) | < 300ms |
| Filter apply (client-side) | < 100ms |
| Tile fetch + render (single tile) | < 500ms |
| Browser heap usage | < 1.2 GB |
| Web Worker layout (1K nodes) | < 200ms |

## Failure & Observability

### Error Handling

- **API timeout:** 10s per request. On timeout, show inline error banner with retry button. Do not block the UI.
- **Retry policy:** Exponential backoff (1s, 2s, 4s), max 3 retries for GET requests. No retry on 4xx errors.
- **Partial load failure:** If some tiles fail to load, render what succeeded. Show a subtle indicator on the failed tile regions.
- **Network offline:** Detect via `navigator.onLine`. Show offline banner. Continue working with cached data. Resume fetching when online.

### Client Telemetry Events

Track these metrics for performance monitoring (emitted as structured events, consumer-agnostic):

- `fps` — rolling average frame rate
- `visible_element_count` — elements currently rendered
- `tile_fetch_ms` — per-tile fetch latency
- `search_ms` — search round-trip time
- `worker_layout_ms` — Web Worker layout computation time
- `heap_mb` — `performance.memory.usedJSHeapSize` (Chrome only, best-effort)

## Delivery Milestones

### MVP
- Project scaffolding, build pipeline, dev tooling
- Geographic map view with tile-based element loading and rendering
- Basic pan/zoom interaction with viewport-based fetching
- Element click to inspect details in side panel
- Mock REST API for development

### Phase 2: Core Features
- Schematic view with d3-force layout in Web Worker
- View toggle between geographic and schematic
- LOD clustering (backend clusters + frontend rendering)
- Search and filter functionality
- Multi-select and drag reposition (schematic view)

### Phase 3: Performance Hardening
- Interaction degradation rules
- LRU tile cache with eviction policies
- AbortController for in-flight request cancellation
- Performance budget validation with benchmark datasets

### Phase 4: Polish
- Topology exploration (expand neighbors, breadcrumb trail)
- Animated viewport transitions (fly-to)
- Status bar, filter chips, keyboard shortcuts
- Telemetry instrumentation

### Benchmark Test Scenarios
- **Dense urban:** 100K elements in a small geographic area
- **Sparse rural:** 10K elements spread across a large area
- **Hub-and-spoke:** Few high-degree nodes with many connections
- **Long chain:** Linear topology with sequential connections
- **Full scale:** 1M elements total, viewport showing 50K
