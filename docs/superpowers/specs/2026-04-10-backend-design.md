# Backend Design — GIS Topology Viewer

## Overview

This document describes the backend service for the High-Performance GIS Topology Viewer. The backend implements the REST API contract defined in the frontend spec, backed by PostgreSQL + PostGIS for spatial storage and MyBatis Plus for data access.

**Branch**: `feat/backend`  
**Location**: `backend/` directory (monorepo alongside `frontend/`)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Java 21 |
| Framework | Spring Boot 3.3.4 |
| Data access | MyBatis Plus 3.5.7 |
| Database | PostgreSQL 15+ with PostGIS 3.x |
| Schema migrations | Flyway |
| JSON | Jackson with JavaTimeModule |
| Testing | JUnit 5 + Testcontainers (`postgis/postgis:15-3.4`) |

---

## Repository Structure

```
backend/
├── pom.xml
├── .mvn/wrapper/maven-wrapper.properties
├── mvnw  (+ mvnw.cmd)
└── src/
    ├── main/
    │   ├── java/com/topology/gis/
    │   │   ├── GisTopologyApplication.java
    │   │   ├── config/
    │   │   │   ├── WebConfig.java          ← CORS (localhost:5173, :4173)
    │   │   │   ├── JacksonConfig.java      ← JavaTimeModule, no timestamp serialization
    │   │   │   └── MybatisPlusConfig.java  ← Pagination plugin
    │   │   ├── entity/
    │   │   │   ├── NetworkElement.java
    │   │   │   └── TopologyLink.java
    │   │   ├── mapper/
    │   │   │   ├── NetworkElementMapper.java
    │   │   │   └── TopologyLinkMapper.java
    │   │   ├── typehandler/
    │   │   │   └── JsonbTypeHandler.java   ← TypeHandler<Map<String,Object>> for JSONB
    │   │   ├── service/
    │   │   │   ├── TileService.java        ← Web Mercator math, filter assembly
    │   │   │   ├── TopologyService.java    ← Element detail, BFS neighbors
    │   │   │   ├── SearchService.java
    │   │   │   ├── ClusteringService.java  ← Quadrant clustering (mirrors TS mock)
    │   │   │   └── SeedService.java        ← LCG PRNG, matches TS mock seed=42
    │   │   ├── controller/
    │   │   │   ├── TileController.java
    │   │   │   ├── ElementController.java
    │   │   │   ├── SearchController.java
    │   │   │   └── AdminController.java    ← @Profile("!prod") only
    │   │   └── dto/                        ← Java records
    │   │       ├── NetworkElementDto.java
    │   │       ├── TopologyLinkDto.java
    │   │       ├── TopologyClusterDto.java
    │   │       ├── EndpointStubDto.java
    │   │       ├── TileElementsResponse.java
    │   │       ├── TileLinksResponse.java
    │   │       ├── NeighborsResponse.java
    │   │       └── SearchResponse.java
    │   └── resources/
    │       ├── application.yml
    │       ├── mapper/
    │       │   ├── NetworkElementMapper.xml
    │       │   └── TopologyLinkMapper.xml
    │       └── db/migration/
    │           └── V1__create_tables.sql
    └── test/
        └── java/com/topology/gis/
            ├── BaseIntegrationTest.java
            ├── TileControllerIntegrationTest.java
            ├── ElementControllerIntegrationTest.java
            └── SearchControllerIntegrationTest.java
```

---

## REST API Contract

All endpoints mirror the TypeScript types in `frontend/src/types/topology.ts`.

### Tile Endpoints

```
GET /api/topology/tiles/{z}/{x}/{y}/elements
  Query params:
    types={csv}          — filter by element type (e.g. "router,switch")
    prop.{key}={value}   — filter on JSONB properties (e.g. prop.status=active)
  Response: TileElementsResponse
    { elements: NetworkElementDto[], clusters: TopologyClusterDto[],
      generation: number, removedIds: string[] }

GET /api/topology/tiles/{z}/{x}/{y}/links
  Query params: same as elements
  Response: TileLinksResponse
    { links: TopologyLinkDto[], stubs: EndpointStubDto[],
      generation: number, removedLinkIds: string[] }
```

**Clustering**: zoom `z < 12` → return clusters, empty elements. `z >= 12` → return individual elements, empty clusters.

**Stubs**: links endpoint returns `EndpointStubDto { id, lng, lat }` for each link endpoint that falls outside the requested tile.

### Element Endpoints

```
GET /api/topology/elements/{id}
  Response: NetworkElementDto

GET /api/topology/elements/{id}/neighbors?depth={1-3}
  Response: NeighborsResponse { elements: NetworkElementDto[], links: TopologyLinkDto[] }
```

### Search

```
GET /api/topology/search?q={query}&limit={n}&types={csv}
  Response: SearchResponse { results: NetworkElementDto[], total: number }
```

### Admin (dev/staging only)

```
POST /api/topology/admin/seed?elements={n}&links={n}
  Seeds the database with random topology data using the same LCG PRNG as the frontend mock.
```

---

## Database Schema

```sql
-- Spatial and trigram extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Elements table
CREATE TABLE network_elements (
    id          VARCHAR(64)   PRIMARY KEY,
    type        VARCHAR(64)   NOT NULL,
    label       VARCHAR(256)  NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    -- Generated stored column for spatial index (no custom TypeHandler needed)
    location    GEOMETRY(Point, 4326)
                GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
    version     INTEGER       NOT NULL DEFAULT 1,
    updated_at  TIMESTAMPTZ   NOT NULL,
    properties  JSONB         NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_elements_location_gist  ON network_elements USING GIST (location);
CREATE INDEX idx_elements_type           ON network_elements (type);
CREATE INDEX idx_elements_properties_gin ON network_elements USING GIN  (properties);
CREATE INDEX idx_elements_label_trgm     ON network_elements USING GIN  (label gin_trgm_ops);

-- Links table
CREATE TABLE topology_links (
    id          VARCHAR(64)   PRIMARY KEY,
    type        VARCHAR(64)   NOT NULL,
    source_id   VARCHAR(64)   NOT NULL REFERENCES network_elements(id) ON DELETE CASCADE,
    target_id   VARCHAR(64)   NOT NULL REFERENCES network_elements(id) ON DELETE CASCADE,
    directed    BOOLEAN       NOT NULL DEFAULT FALSE,
    weight      DOUBLE PRECISION,
    status      VARCHAR(64),
    version     INTEGER       NOT NULL DEFAULT 1,
    updated_at  TIMESTAMPTZ   NOT NULL,
    properties  JSONB         NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_links_source_id ON topology_links (source_id);
CREATE INDEX idx_links_target_id ON topology_links (target_id);
```

**Design rationale**: `lng`/`lat` as plain `DOUBLE PRECISION` columns avoids a custom geometry TypeHandler. The `location` generated column provides the PostGIS spatial index (`ST_Within`) without any ORM geometry type mapping.

---

## Key Design Decisions

### Tile Coordinate Math (Web Mercator)

Mirrors `data-generator.ts` exactly:

```java
double n = Math.pow(2, z);
double west  = (x / n) * 360.0 - 180.0;
double east  = ((x + 1) / n) * 360.0 - 180.0;
double north = Math.toDegrees(Math.atan(Math.sinh(Math.PI * (1.0 - 2.0 * y / n))));
double south = Math.toDegrees(Math.atan(Math.sinh(Math.PI * (1.0 - 2.0 * (y + 1) / n))));
```

### Clustering Algorithm

Divides tile bbox into 4 equal quadrants. Each non-empty quadrant becomes one cluster.

- Cluster ID format: `tile:{z}/{x}/{y}:q{0-3}` (stable, deterministic)
- Quadrant index: `qi = (lng >= midLng ? 1 : 0) + (lat >= midLat ? 2 : 0)`
- Centroid = center of quadrant bbox (NOT spatial mean — matches TS mock)

### JSONB TypeHandler

`JsonbTypeHandler` serializes `Map<String, Object>` to PostgreSQL `jsonb` via `PGobject`. Registered via `mybatis-plus.type-handlers-package`.

### BFS Neighbor Traversal

Implemented as a PostgreSQL `WITH RECURSIVE` CTE in `TopologyLinkMapper.xml`. The `UNION` (not `UNION ALL`) prevents infinite loops in cyclic graphs. Depth is clamped to 3.

### Filter Assembly

- `types` → PostgreSQL array literal `{router,switch}` → `type = ANY(...)` 
- `prop.*` params → merged into single JSON object → `properties @> '{"key":"val"}'::jsonb`

### Generation Tracking

v1 returns static `generation = 1` and empty `removedIds`/`removedLinkIds`. The frontend discards stale responses using the generation number, which is sufficient for a single-writer read-only data set.

### Seed Service

Uses the same Linear Congruential Generator as the TypeScript mock:
```
seed = (seed * 16807L) % 2147483647L
```
Starting seed: 42. Seed is **not reset** between element and link generation (matches TS mock continuity).

---

## Configuration

### `application.yml`

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/gis_topology
    username: postgres
    password: postgres
  flyway:
    enabled: true
    locations: classpath:db/migration

mybatis-plus:
  mapper-locations: classpath:mapper/*.xml
  type-handlers-package: com.topology.gis.typehandler
  configuration:
    map-underscore-to-camel-case: true
  global-config:
    db-config:
      id-type: input

server:
  port: 8080
```

### Frontend Integration

In development with both frontend and backend running, Vite proxies `/api/*` to `http://localhost:8080` (configured in `frontend/vite.config.ts`). When running with the real backend, set `VITE_USE_MOCK=false` in `frontend/.env.local` to disable MSW.

---

## Running Locally

```bash
# Start frontend only (uses MSW mocks)
npm run dev

# Start backend only (requires PostgreSQL running locally)
npm run dev:backend

# Start both
npm run dev:full

# Build backend JAR
npm run build:backend

# Run backend tests (requires Docker for Testcontainers)
npm run test:backend
```

---

## Testing Strategy

Integration tests use Testcontainers with `postgis/postgis:15-3.4`. Flyway runs migrations automatically on the test container.

| Test class | Coverage |
|---|---|
| `TileControllerIntegrationTest` | Tile elements/links, clustering at z<12, type and property filters |
| `ElementControllerIntegrationTest` | Element detail, 404 handling, neighbor BFS up to depth 3 |
| `SearchControllerIntegrationTest` | Label search, type filter, total count accuracy |
