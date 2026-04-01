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

### Network Element (Node)

```typescript
interface NetworkElement {
  id: string
  type: string              // user-defined category
  label: string
  lng: number               // geographic longitude
  lat: number               // geographic latitude
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
  properties: Record<string, unknown>
}
```

### In-Memory Storage

Graphology `Graph` instance as the single source of truth. All nodes and edges are stored in the graph with their attributes.

Capabilities:
- O(1) node/edge lookup by ID
- Efficient neighbor traversal for topology exploration
- Built-in support for filtering, iteration, and export

## REST API Contract

```
GET /api/topology/elements?bbox={w,s,e,n}&zoom={z}
  -> returns elements within bounding box, clustered by zoom level

GET /api/topology/elements/{id}
  -> returns single element with full details

GET /api/topology/elements/{id}/neighbors?depth={n}
  -> returns connected elements up to n hops (default 1)

GET /api/topology/links?bbox={w,s,e,n}&zoom={z}
  -> returns links within bounding box

GET /api/topology/search?q={query}&limit={n}
  -> returns matching elements across full dataset
```

The backend is responsible for spatial queries, clustering at zoom levels, and search indexing. The frontend requests only what is needed for the current viewport and zoom.

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

## Non-Functional Requirements

All treated as equal priority:

- **Rendering performance:** Smooth 60fps pan/zoom at scale
- **Initial load time:** Fast time-to-first-meaningful-paint
- **Search & filtering speed:** Instant results across 1M elements
- **Memory efficiency:** Low browser memory footprint
