# Region LOD Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build low-zoom administrative region summaries with aggregated region-to-region topology links, then switch to existing SVG device layers at detailed zoom.

**Architecture:** Add a `regions` hierarchy and region assignment columns in PostGIS, expose a viewport-scoped region summary API, and add a frontend region loader/store plus Deck.gl region layers. Existing tile element/link loading remains authoritative for `z >= 10`; region summary loading is authoritative for `z <= 9`.

**Tech Stack:** Spring Boot 3, Java 21, MyBatis-Plus, PostgreSQL/PostGIS, Vue 3, Pinia, Vite, Deck.gl.

---

### Task 1: Backend Region Schema And Seed Assignment

**Files:**
- Create: `backend/src/main/resources/db/migration/V2__add_regions.sql`
- Modify: `backend/src/main/java/com/topology/gis/shared/entity/NetworkElement.java`
- Modify: `backend/src/main/java/com/topology/gis/admin/SeedService.java`
- Modify: `backend/src/test/resources/test-data.sql`
- Test: `backend/src/test/java/com/topology/gis/RegionControllerIntegrationTest.java`

- [ ] **Step 1: Write failing integration test for region endpoint availability**

Create `RegionControllerIntegrationTest` with a first test that calls the planned endpoint before it exists:

```java
package com.topology.gis;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class RegionControllerIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private com.topology.gis.admin.SeedService seedService;

    @BeforeEach
    void setUp() {
        seedService.seed(1000, 600);
    }

    @Test
    void regionSummary_atCountryZoom_returnsVisibleCountries() {
        ResponseEntity<com.topology.gis.region.dto.RegionSummaryResponse> resp =
                restTemplate.getForEntity(
                        "/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85",
                        com.topology.gis.region.dto.RegionSummaryResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().level()).isEqualTo("country");
        assertThat(resp.getBody().regions()).isNotEmpty();
    }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd backend && ./mvnw -Dtest=RegionControllerIntegrationTest test`

Expected: compilation fails because `RegionSummaryResponse` does not exist, or HTTP test fails because `/api/topology/regions/summary` does not exist.

- [ ] **Step 3: Add region schema migration**

Create `V2__add_regions.sql` with:

```sql
CREATE TABLE regions
(
    id           VARCHAR(64) NOT NULL PRIMARY KEY,
    level        VARCHAR(32) NOT NULL,
    name         VARCHAR(128) NOT NULL,
    parent_id    VARCHAR(64) REFERENCES regions (id) ON DELETE CASCADE,
    centroid_lng DOUBLE PRECISION NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL,
    bbox_west    DOUBLE PRECISION NOT NULL,
    bbox_south   DOUBLE PRECISION NOT NULL,
    bbox_east    DOUBLE PRECISION NOT NULL,
    bbox_north   DOUBLE PRECISION NOT NULL,
    geom         GEOMETRY(Polygon, 4326) NOT NULL
);

CREATE INDEX idx_regions_level ON regions (level);
CREATE INDEX idx_regions_parent_id ON regions (parent_id);
CREATE INDEX idx_regions_geom_gist ON regions USING GIST (geom);

ALTER TABLE network_elements ADD COLUMN country_region_id VARCHAR(64) REFERENCES regions (id) ON DELETE SET NULL;
ALTER TABLE network_elements ADD COLUMN province_region_id VARCHAR(64) REFERENCES regions (id) ON DELETE SET NULL;
ALTER TABLE network_elements ADD COLUMN city_region_id VARCHAR(64) REFERENCES regions (id) ON DELETE SET NULL;

CREATE INDEX idx_elements_country_region ON network_elements (country_region_id);
CREATE INDEX idx_elements_province_region ON network_elements (province_region_id);
CREATE INDEX idx_elements_city_region ON network_elements (city_region_id);
```

Then insert deterministic synthetic regions:

```sql
INSERT INTO regions (id, level, name, parent_id, centroid_lng, centroid_lat, bbox_west, bbox_south, bbox_east, bbox_north, geom)
SELECT
    'country-' || c,
    'country',
    'Country ' || (c + 1),
    NULL,
    -180.0 + c * 90.0 + 45.0,
    0.0,
    -180.0 + c * 90.0,
    -90.0,
    -180.0 + (c + 1) * 90.0,
    90.0,
    ST_MakeEnvelope(-180.0 + c * 90.0, -90.0, -180.0 + (c + 1) * 90.0, 90.0, 4326)
FROM generate_series(0, 3) AS c;
```

Add matching `province-{c}-{p}` and `city-{c}-{p}-{city}` inserts using `generate_series(0, 3)`, `generate_series(0, 2)`, and `ST_MakeEnvelope`.

- [ ] **Step 4: Extend `NetworkElement` with region columns**

Add fields:

```java
@TableField("country_region_id")
private String countryRegionId;

@TableField("province_region_id")
private String provinceRegionId;

@TableField("city_region_id")
private String cityRegionId;
```

- [ ] **Step 5: Assign seeded elements to deterministic regions**

In `SeedService`, add:

```java
private static RegionAssignment assignRegion(double lng, double lat) {
    int country = Math.min(3, Math.max(0, (int) Math.floor((lng + 180.0) / 90.0)));
    int province = Math.min(2, Math.max(0, (int) Math.floor((lat + 90.0) / 60.0)));
    double countryWest = -180.0 + country * 90.0;
    int city = Math.min(2, Math.max(0, (int) Math.floor((lng - countryWest) / 30.0)));
    return new RegionAssignment(
            "country-" + country,
            "province-" + country + "-" + province,
            "city-" + country + "-" + province + "-" + city
    );
}

private record RegionAssignment(String countryId, String provinceId, String cityId) {}
```

Call it for each generated element and set the three new fields.

- [ ] **Step 6: Update SQL seed file region columns**

Update `backend/src/test/resources/test-data.sql` so `network_elements` inserts include `country_region_id`, `province_region_id`, and `city_region_id`. After inserting all elements, run one deterministic assignment update:

```sql
WITH indexed AS (
  SELECT
      id,
      LEAST(3, GREATEST(0, FLOOR((lng + 180.0) / 90.0)::int)) AS c,
      LEAST(2, GREATEST(0, FLOOR((lat + 90.0) / 60.0)::int)) AS p,
      lng
  FROM network_elements
),
assigned AS (
  SELECT
      id,
      c,
      p,
      LEAST(2, GREATEST(0, FLOOR((lng - (-180.0 + c * 90.0)) / 30.0)::int)) AS city
  FROM indexed
)
UPDATE network_elements ne
SET country_region_id = 'country-' || assigned.c,
    province_region_id = 'province-' || assigned.c || '-' || assigned.p,
    city_region_id = 'city-' || assigned.c || '-' || assigned.p || '-' || assigned.city
FROM assigned
WHERE ne.id = assigned.id;
```

- [ ] **Step 7: Run RED test again**

Run: `cd backend && ./mvnw -Dtest=RegionControllerIntegrationTest test`

Expected: endpoint still missing, but schema and seed setup should no longer fail.

### Task 2: Backend Region Summary API

**Files:**
- Create: `backend/src/main/java/com/topology/gis/region/RegionController.java`
- Create: `backend/src/main/java/com/topology/gis/region/RegionService.java`
- Create: `backend/src/main/java/com/topology/gis/region/dto/RegionBBoxDto.java`
- Create: `backend/src/main/java/com/topology/gis/region/dto/RegionSummaryDto.java`
- Create: `backend/src/main/java/com/topology/gis/region/dto/RegionVirtualLinkDto.java`
- Create: `backend/src/main/java/com/topology/gis/region/dto/RegionSummaryResponse.java`
- Create: `backend/src/main/java/com/topology/gis/region/dto/RegionTypeCountRow.java`
- Create: `backend/src/main/java/com/topology/gis/region/dto/RegionInternalLinkRow.java`
- Create: `backend/src/main/java/com/topology/gis/region/dto/RegionVirtualLinkRow.java`
- Create: `backend/src/main/java/com/topology/gis/shared/mapper/RegionMapper.java`
- Create: `backend/src/main/resources/mapper/RegionMapper.xml`
- Test: `backend/src/test/java/com/topology/gis/RegionControllerIntegrationTest.java`

- [ ] **Step 1: Add failing tests for counts, filters, virtual links, and high zoom**

Extend `RegionControllerIntegrationTest`:

```java
@Test
void regionSummary_typeCountsSumToTotal() {
    var resp = restTemplate.getForEntity(
            "/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85",
            com.topology.gis.region.dto.RegionSummaryResponse.class);

    assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    var region = resp.getBody().regions().getFirst();
    long sum = region.elementTypes().values().stream().mapToLong(Long::longValue).sum();
    assertThat(sum).isEqualTo(region.totalCount());
}

@Test
void regionSummary_typeFilterLimitsCounts() {
    var resp = restTemplate.getForEntity(
            "/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85&types=router",
            com.topology.gis.region.dto.RegionSummaryResponse.class);

    assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    assertThat(resp.getBody().regions()).isNotEmpty();
    resp.getBody().regions().forEach(region -> {
        assertThat(region.elementTypes().get("router")).isEqualTo(region.totalCount());
        assertThat(region.elementTypes().get("firewall")).isZero();
        assertThat(region.elementTypes().get("switch")).isZero();
        assertThat(region.elementTypes().get("server")).isZero();
        assertThat(region.elementTypes().get("access-point")).isZero();
    });
}

@Test
void regionSummary_virtualLinksAggregateBetweenRegions() {
    var resp = restTemplate.getForEntity(
            "/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85",
            com.topology.gis.region.dto.RegionSummaryResponse.class);

    assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    assertThat(resp.getBody().links()).allSatisfy(link -> {
        assertThat(link.sourceRegionId()).isNotEqualTo(link.targetRegionId());
        assertThat(link.count()).isPositive();
    });
}

@Test
void regionSummary_atDeviceZoomReturnsEmptyResponse() {
    var resp = restTemplate.getForEntity(
            "/api/topology/regions/summary?z=10&west=-180&south=-85&east=180&north=85",
            com.topology.gis.region.dto.RegionSummaryResponse.class);

    assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    assertThat(resp.getBody().level()).isNull();
    assertThat(resp.getBody().regions()).isEmpty();
    assertThat(resp.getBody().links()).isEmpty();
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && ./mvnw -Dtest=RegionControllerIntegrationTest test`

Expected: fails because controller/service/mapper are missing.

- [ ] **Step 3: Add DTO records**

Create response DTOs exactly matching the test names:

```java
public record RegionSummaryResponse(
        String level,
        List<RegionSummaryDto> regions,
        List<RegionVirtualLinkDto> links,
        long generation
) {}
```

Each `RegionSummaryDto` has `Map<String, Long> elementTypes` and `long internalLinkCount`. Each row DTO exposes only scalar fields returned by MyBatis.

- [ ] **Step 4: Add mapper SQL**

Use fixed service-controlled `${regionColumn}` values only. Query region type counts by visible region and type, query internal links where source and target active region match, and query virtual links with normalized region pairs:

```sql
LEAST(src.${regionColumn}, tgt.${regionColumn}) AS source_region_id,
GREATEST(src.${regionColumn}, tgt.${regionColumn}) AS target_region_id
```

Use the same type and property filter semantics on both link endpoints.

- [ ] **Step 5: Add service aggregation**

Implement:

```java
static String levelForZoom(int z) {
    if (z <= 3) return "country";
    if (z <= 6) return "province";
    if (z <= 9) return "city";
    return null;
}
```

Build `RegionSummaryDto` objects with all five type keys present and missing values set to zero.

- [ ] **Step 6: Add controller validation**

Create `/api/topology/regions/summary` with `z`, `west`, `south`, `east`, `north`, `types`, and `prop.*` parsing. Reuse the same token limits as `TileController`.

- [ ] **Step 7: Run backend tests and commit**

Run: `cd backend && ./mvnw -Dtest=RegionControllerIntegrationTest test`

Expected: all region tests pass.

Commit:

```bash
git add backend
git commit -m "feat: add region summary api"
```

### Task 3: Frontend Region Types, Store, And API Client

**Files:**
- Modify: `frontend/src/types/topology.ts`
- Create: `frontend/src/api/region-service.ts`
- Create: `frontend/src/stores/regions.ts`
- Test: `frontend/tests/unit/api/region-service.test.ts`
- Test: `frontend/tests/unit/stores/regions.test.ts`

- [ ] **Step 1: Write failing frontend tests**

Add tests that expect:

```typescript
expect(buildRegionSummaryQuery({ z: 2, bounds, types: ['router'], propertyFilters: { vendor: 'acme' }}))
  .toBe('?z=2&west=-180&south=-85&east=180&north=85&types=router&prop.vendor=acme')
```

Add store tests that load a response, expose `regionsList`, expose `linkCount`, and clear summaries.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend && npm run test:unit -- tests/unit/api/region-service.test.ts tests/unit/stores/regions.test.ts`

Expected: missing module failures.

- [ ] **Step 3: Add TypeScript region interfaces**

Add `RegionSummaryResponse`, `RegionSummary`, `RegionVirtualLink`, and `RegionBBox` to `frontend/src/types/topology.ts`.

- [ ] **Step 4: Add `RegionService`**

Implement `buildRegionSummaryQuery()` and `fetchRegionSummary()` using `apiGet<RegionSummaryResponse>()` and abort controllers.

- [ ] **Step 5: Add Pinia region store**

Store `level`, `regions`, `links`, `generation`, `isLoading`, and `error`. Provide `replaceSummary()`, `clear()`, `regionsList`, and `linkCount`.

- [ ] **Step 6: Run tests and commit**

Run: `cd frontend && npm run test:unit -- tests/unit/api/region-service.test.ts tests/unit/stores/regions.test.ts`

Expected: new frontend tests pass.

Commit:

```bash
git add frontend/src/types/topology.ts frontend/src/api/region-service.ts frontend/src/stores/regions.ts frontend/tests/unit/api/region-service.test.ts frontend/tests/unit/stores/regions.test.ts
git commit -m "feat: add frontend region summary state"
```

### Task 4: Frontend Region Loading And Device Tile Cutover

**Files:**
- Modify: `frontend/src/composables/use-tile-loader.ts`
- Create: `frontend/src/composables/use-region-loader.ts`
- Modify: `frontend/src/components/MapView.vue`
- Test: `frontend/tests/unit/composables/use-tile-loader.test.ts`
- Test: `frontend/tests/unit/composables/use-region-loader.test.ts`
- Test: `frontend/tests/unit/components/map-view.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:

```typescript
expect(shouldUseDeviceTiles(9.9)).toBe(false)
expect(shouldUseDeviceTiles(10)).toBe(true)
```

Add region loader tests proving `z <= 9` calls region API and `z >= 10` clears region summaries.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend && npm run test:unit -- tests/unit/composables/use-tile-loader.test.ts tests/unit/composables/use-region-loader.test.ts tests/unit/components/map-view.test.ts`

Expected: missing helper/composable failures.

- [ ] **Step 3: Gate tile loading**

Export:

```typescript
export function shouldUseDeviceTiles(zoom: number): boolean {
  return Math.floor(zoom) >= 10
}
```

At the start of `loadVisibleTiles()`, clear loaded tile state and return when `shouldUseDeviceTiles(viewportStore.zoom)` is false.

- [ ] **Step 4: Add region loader**

Create `useRegionLoader()` with a 200 ms debounce, generation discard, filter query support, and cleanup. It calls region summaries only when `Math.floor(viewportStore.zoom) <= 9`.

- [ ] **Step 5: Wire MapView**

In `MapView.vue`, call both composables. On map load, call `loadRegionSummaries()` and `loadVisibleTiles()` after `syncViewport()`. The two loaders decide which one is active from zoom.

- [ ] **Step 6: Run tests and commit**

Run: `cd frontend && npm run test:unit -- tests/unit/composables/use-tile-loader.test.ts tests/unit/composables/use-region-loader.test.ts tests/unit/components/map-view.test.ts`

Expected: cutover tests pass.

Commit:

```bash
git add frontend/src/composables/use-tile-loader.ts frontend/src/composables/use-region-loader.ts frontend/src/components/MapView.vue frontend/tests/unit/composables/use-tile-loader.test.ts frontend/tests/unit/composables/use-region-loader.test.ts frontend/tests/unit/components/map-view.test.ts
git commit -m "feat: switch low zoom map to region summaries"
```

### Task 5: Frontend Region Deck Layers

**Files:**
- Modify: `frontend/src/composables/use-deck-layers.ts`
- Test: `frontend/tests/unit/composables/use-deck-layers.test.ts`

- [ ] **Step 1: Write failing region layer test**

Add a test that loads region summaries into `useRegionStore()` and expects layer ids:

```typescript
expect(layerIds).toContain('region-virtual-links')
expect(layerIds).toContain('region-boundaries')
expect(layerIds).toContain('region-summary-labels')
expect(layerIds).not.toContain('node-icons')
```

- [ ] **Step 2: Run test and verify RED**

Run: `cd frontend && npm run test:unit -- tests/unit/composables/use-deck-layers.test.ts`

Expected: missing region layers.

- [ ] **Step 3: Add region layers**

Import `PolygonLayer` and `TextLayer`. If `regionStore.regionsList.length > 0`, return:

```typescript
new LineLayer({ id: 'region-virtual-links', ... })
new PolygonLayer({ id: 'region-boundaries', ... })
new TextLayer({ id: 'region-summary-labels', ... })
```

Use region centroids for link endpoints and bbox polygons for boundaries. Format text as region name, total count, and compact type counts.

- [ ] **Step 4: Run test and commit**

Run: `cd frontend && npm run test:unit -- tests/unit/composables/use-deck-layers.test.ts`

Expected: deck layer tests pass.

Commit:

```bash
git add frontend/src/composables/use-deck-layers.ts frontend/tests/unit/composables/use-deck-layers.test.ts
git commit -m "feat: render region summary layers"
```

### Task 6: Full Verification And Docker Manual Test

**Files:**
- Modify only if verification exposes defects.

- [ ] **Step 1: Run frontend unit tests**

Run: `cd frontend && npm run test:unit`

Expected: all frontend unit tests pass.

- [ ] **Step 2: Run frontend type-check and build**

Run: `cd frontend && npm run type-check`

Expected: type-check passes.

Run: `cd frontend && npm run build`

Expected: Vite build passes; existing chunk-size warning is acceptable.

- [ ] **Step 3: Run backend tests**

Run: `npm run test:backend`

Expected: backend integration tests pass.

- [ ] **Step 4: Build backend JAR and Docker stack**

Run: `cd backend && mvn package -DskipTests -q`

Expected: backend JAR exists under `backend/target/`.

Run: `docker compose --profile seed build`

Expected: frontend and backend Docker images build.

Run: `docker compose --profile seed up -d`

Expected: stack starts and seeder completes or runs in the background.

- [ ] **Step 5: Verify running services**

Run: `curl -s http://localhost:8080/actuator/health`

Expected: `{"status":"UP"}`

Run: `curl -I -s http://localhost:8081`

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 6: Browser verification**

Open `http://localhost:8081` in the in-app browser. Verify:

```text
Low zoom z <= 9: region summary cards and virtual region links are visible.
High zoom z >= 10: individual SVG device icons and real links are visible.
Panning clips old region summaries and old device tiles.
Type filters affect region summaries and device layers.
```

- [ ] **Step 7: Commit final fixes**

If verification fixes were needed:

```bash
git add <changed files>
git commit -m "fix: stabilize region lod map display"
```

If no verification fixes were needed, do not create an empty commit.
