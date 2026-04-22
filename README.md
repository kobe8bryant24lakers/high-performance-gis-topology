# High-Performance GIS Topology

A real-time network topology visualizer built for large-scale GIS datasets — millions of elements rendered on both a geographic map and a force-directed schematic view.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + Vite + TypeScript |
| Rendering | deck.gl 9 (WebGL) + Mapbox GL JS |
| Backend | Spring Boot 3 / Java 21 |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Containerization | Docker Compose |

---

## Quick Start (Docker)

> **macOS note:** Maven's `dependency:go-offline` fails inside Docker on macOS Docker Desktop due to TLS issues with Maven Central. Build the JAR locally first.

### 1. Copy and configure environment variables

```sh
cp .env.example .env
```

Edit `.env` and set:
- `POSTGRES_PASSWORD` — database password (default: `postgres`)
- `ADMIN_SEED_TOKEN` — token for the seed API endpoint (default: `dev-seed-token`)
- `VITE_MAPBOX_TOKEN` — **required** — get a free token at [mapbox.com](https://www.mapbox.com/)

### 2. Build the backend JAR locally

```sh
cd backend && mvn package -DskipTests -q && cd ..
```

### 3. Build Docker images

```sh
docker compose --profile seed build
```

### 4. Start the full stack with seed data

```sh
docker compose --profile seed up -d
```

This starts four services:
- `postgres` — PostGIS database
- `backend` — Spring Boot API on port 8080
- `frontend` — Vue app served by Nginx on port 8081
- `seeder` — one-shot container that loads ~1.6M rows from `backend/src/test/resources/test-data.sql`, then exits

### 5. Verify

```sh
curl http://localhost:8080/actuator/health   # → {"status":"UP"}
```

Open **http://localhost:8081** in a browser.

### Tear down

```sh
docker compose --profile seed down          # stop containers
docker compose --profile seed down -v       # also wipe the database volume
```

---

## Local Development (without Docker)

### Prerequisites

- Node 20+
- Java 21
- Maven 3.9+
- PostgreSQL 16 with PostGIS 3.4 running locally

### Backend

```sh
cd backend
mvn spring-boot:run
```

The API starts on port 8080.

### Frontend

```sh
cd frontend
npm install
npm run dev
```

The dev server starts on port 5173 with hot-reload.

---

## Project Structure

```
.
├── backend/                    Spring Boot application
│   ├── src/main/java/com/topology/gis/
│   │   ├── tile/               Tile-based element/link API
│   │   ├── element/            Element detail & neighbors API
│   │   ├── search/             Full-text search API
│   │   └── admin/              Seed endpoint
│   └── src/test/resources/
│       └── test-data.sql       Seed data (~1.6M rows)
│
├── frontend/                   Vue 3 application
│   └── src/
│       ├── components/
│       │   ├── MapView.vue         Geographic map (Mapbox + deck.gl overlay)
│       │   └── SchematicView.vue   Force-directed graph view (deck.gl orthographic)
│       ├── composables/
│       │   ├── use-deck-layers.ts  Builds deck.gl layer stack
│       │   ├── use-force-layout.ts Web Worker-based force layout
│       │   └── use-tile-loader.ts  Viewport-driven tile fetching
│       ├── stores/
│       │   ├── topology.ts         Graphology graph + tile lifecycle
│       │   ├── selection.ts        Selected element IDs
│       │   ├── performance.ts      Degradation level based on visible count
│       │   └── filter.ts           Active type/property filters
│       └── types/topology.ts       Domain types (NetworkElement, TopologyLink, …)
│
└── docker-compose.yml
```

---

## Architecture Overview

### Tile-based data loading

The backend exposes a slippy-map tile API (`/api/topology/tiles/{z}/{x}/{y}/elements` and `/links`). The frontend requests only tiles in the current viewport and merges results into a [Graphology](https://graphology.github.io/) in-memory graph. Tiles are evicted when they leave the viewport.

### Rendering pipeline

`use-deck-layers.ts` builds a deck.gl layer stack on every relevant state change:

| Layer | Purpose | Degradation gate |
|-------|---------|-----------------|
| `LineLayer` | Topology links (slate blue) | always |
| `ScatterplotLayer` — halos | Orange ring on selected nodes | suppressed at `minimal` (50k+ nodes) |
| `ScatterplotLayer` — nodes | Per-type colored circles | always |
| `TextLayer` — labels | Short type label centered on each node | `full` only (< 10k nodes) |

### Performance degradation

The performance store tracks `visibleElementCount` and reduces rendering fidelity automatically:

| Level | Threshold | What is disabled |
|-------|-----------|-----------------|
| `full` | < 10 000 | nothing |
| `reduced` | 10 000 – 50 000 | hover events, type labels |
| `minimal` | 50 000+ | hover, labels, selection halos |

### Network element types

| Type | Node color | Label |
|------|-----------|-------|
| router | green | R |
| switch | blue | S |
| server | purple | Sv |
| firewall | red | F |
| access-point | yellow | AP |

### Schematic view

Switching to schematic mode runs a force-directed layout in a Web Worker (`layout-worker.ts`). Nodes are repositioned iteratively; the geographic coordinate system is replaced with an orthographic 2D space.

---

## Key Techniques

### Data layer

**Tile-based streaming** — slippy-map tile coordinates (`z/x/y`) drive all data fetching. The frontend requests only tiles in the current viewport, keeping memory bounded regardless of dataset size.

**Graphology in-memory graph** — all topology data lives in a client-side directed/undirected mixed graph. Nodes and edges are merged incrementally as tiles arrive and evicted when tiles leave the viewport.

**Deferred node eviction** — selected (pinned) nodes are not evicted immediately when their tile leaves the viewport; they are queued and removed only when deselected, preventing visual pop-out during interaction.

**PostGIS spatial indexing** — element locations are stored as `geometry(Point,4326)` with a GiST index, enabling fast bounding-box tile queries directly in the database.

**GIN trigram index** — element labels are indexed with `pg_trgm` for fast substring / `ILIKE`-style full-text search without a separate search engine.

### Rendering

**WebGL via deck.gl** — all nodes and links render on a single WebGL canvas with no DOM elements per node, scaling to millions of elements without layout thrash.

**Layer stack composition** — the render pipeline is a stack of independent deck.gl layers (LineLayer → halo ScatterplotLayer → node ScatterplotLayer → TextLayer). Each layer has its own `updateTriggers` so only GPU attribute buffers affected by a state change are re-uploaded.

**shallowRef caching** — `cachedNodes` and `cachedEdges` are `shallowRef` arrays rebuilt only when graph topology or filters change (not on every selection tick), preventing unnecessary layer rebuilds.

**Adaptive degradation** — three fidelity tiers (`full` / `reduced` / `minimal`) gate hover events, selection halos, and per-node text labels based on visible element count (thresholds: 10k, 50k). The main `ScatterplotLayer` and `LineLayer` always render.

### Frontend architecture

**Vue 3 Composition API + Pinia** — shared state (graph, selection, filters, viewport, performance) lives in Pinia stores. Composables encapsulate reactive side effects cleanly.

**Web Worker for layout** — the force-directed layout runs entirely off the main thread in `layout-worker.ts`. Position updates are posted back as messages, keeping the UI responsive during iterative layout.

**LRU tile cache** — a least-recently-used cache caps the number of tile responses held in memory, evicting the oldest entries under memory pressure.

### Backend & infrastructure

**Testcontainers integration tests** — integration tests spin up a real PostGIS container per run; no database mocking. This caught a production schema migration issue that mocked tests would have missed.

**Flyway migrations** — schema is versioned and applied automatically on startup, keeping dev, test, and production databases in sync.

**Docker Compose profiles** — the `seeder` service is gated behind `--profile seed` so a normal `up` doesn't run it. The seeder is `restart: "no"` and exits after a single SQL load.

**Nginx reverse proxy** — the frontend container proxies `/api/` to the backend so the browser communicates with one origin, eliminating CORS configuration.

---

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/topology/tiles/{z}/{x}/{y}/elements` | Elements and clusters in a tile |
| `GET /api/topology/tiles/{z}/{x}/{y}/links` | Links (and endpoint stubs) in a tile |
| `GET /api/topology/elements/{id}` | Single element detail |
| `GET /api/topology/elements/{id}/neighbors` | Adjacent elements and links |
| `GET /api/topology/search?q=…` | Full-text search |
| `GET /actuator/health` | Health check |

---

## Running Tests

### Frontend (Vitest)

```sh
cd frontend && npx vitest run
```

### Backend (JUnit + Testcontainers)

```sh
cd backend && mvn test
```

Integration tests spin up a real PostGIS container via Testcontainers. Docker must be running.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Service definitions; use `--profile seed` to include the seeder |
| `backend/Dockerfile` | Copies pre-built JAR from `target/`; does not build from source inside Docker |
| `backend/.dockerignore` | `target/` must **not** be excluded so Docker can copy the JAR |
| `backend/src/test/resources/test-data.sql` | Seed data loaded by the seeder container |
| `.env` / `.env.example` | Local secrets — never committed |
| `frontend/nginx.conf` | Nginx config; proxies `/api/` to the backend |

---

## IDE Setup

**VS Code** — install the [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) extension (disable Vetur if installed).

**Browser devtools** — install [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd) for Chrome/Edge and enable Custom Object Formatters in DevTools settings.
