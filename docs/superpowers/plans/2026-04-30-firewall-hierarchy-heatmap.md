# Firewall Hierarchy and Adaptive Overview Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show only a sparse set of core firewalls on first open, progressively reveal lower firewall tiers by zoom, and make the overview minimap heatmap follow the same viewport/zoom visibility policy.

**Architecture:** Add deterministic `networkTier` metadata to firewall seed/mock data, enforce zoom-derived type and tier policy in backend tile and heatmap queries, and pass current zoom/bounds into the overview minimap heatmap request. The API schema stays unchanged; hierarchy remains in `NetworkElement.properties`.

**Tech Stack:** Java 21, Spring Boot 3, MyBatis XML mappers, PostgreSQL JSONB, Vue 3, Pinia, TypeScript, Vitest, Vue Test Utils.

---

## File Structure

- Modify `backend/src/main/java/com/topology/gis/tile/TileService.java`: compute effective type/tier policy, merge user `prop.networkTier` by intersection, pass tier filters to mappers.
- Modify `backend/src/main/java/com/topology/gis/heatmap/HeatmapController.java`: accept optional `z` query parameter.
- Modify `backend/src/main/java/com/topology/gis/heatmap/HeatmapService.java`: apply tile visibility policy to heatmap queries.
- Modify `backend/src/main/java/com/topology/gis/shared/mapper/NetworkElementMapper.java` and `backend/src/main/resources/mapper/NetworkElementMapper.xml`: add `networkTiers` array filter for tile elements and IDs.
- Modify `backend/src/main/java/com/topology/gis/shared/mapper/HeatmapMapper.java` and `backend/src/main/resources/mapper/HeatmapMapper.xml`: add `networkTiers` array filter for heatmap cells.
- Modify `backend/src/test/resources/test-data.sql`: write deterministic `networkTier` properties for generated firewall rows.
- Modify `backend/src/main/java/com/topology/gis/admin/SeedService.java`: write deterministic `networkTier` properties for admin seed firewall rows.
- Modify `backend/src/test/java/com/topology/gis/tile/TileServiceZoomPolicyTest.java`, `backend/src/test/java/com/topology/gis/admin/SeedServiceTest.java`, and `backend/src/test/java/com/topology/gis/HeatmapControllerIntegrationTest.java`: cover zoom tier policy, seed metadata, and heatmap zoom filtering.
- Create `frontend/src/utils/visibility-policy.ts`: frontend mirror of zoom type/tier policy for mocks and overview query construction.
- Modify `frontend/src/api/heatmap-service.ts`: include zoom in heatmap query strings.
- Modify `frontend/src/components/OverviewMinimap.vue`: accept zoom, compute viewport+buffer heatmap bounds, use local projection bounds, request zoom-aware heatmap.
- Modify `frontend/src/components/MapView.vue`: pass `viewportStore.zoom` to `OverviewMinimap`.
- Modify `frontend/src/mock/data-generator.ts` and `frontend/src/mock/handlers.ts`: generate and enforce deterministic firewall tiers.
- Modify `frontend/tests/unit/components/overview-minimap.test.ts`, `frontend/tests/unit/components/map-view.test.ts`, `frontend/tests/unit/api/heatmap-service.test.ts`, and `frontend/tests/unit/composables/use-tile-loader.test.ts`: cover zoom-aware heatmap and tier policy.

## Tasks

### Task 1: Backend Policy and Mapper Tests

**Files:**
- Modify: `backend/src/test/java/com/topology/gis/tile/TileServiceZoomPolicyTest.java`

- [ ] **Step 1: Write failing tests**

Add tests asserting:

```java
assertThat(TileService.allowedTypesForZoom(5)).containsExactly("firewall");
assertThat(TileService.allowedTypesForZoom(10)).containsExactly("firewall");
assertThat(TileService.allowedTypesForZoom(12)).containsExactlyInAnyOrder("firewall", "router", "switch");
assertThat(TileService.firewallTiersForZoom(5)).containsExactly("core");
assertThat(TileService.firewallTiersForZoom(8)).containsExactly("aggregation", "core");
assertThat(TileService.firewallTiersForZoom(11)).isEmpty();
```

Add mapper-proxy tests that call `getTileElements(5, ..., List.of(), Map.of())` and assert `findInTile` receives a non-null tier array of `{core}`. Add another test with `Map.of("networkTier", "access")` at zoom 5 and assert no DB query is executed.

- [ ] **Step 2: Verify red**

Run: `cd backend && ./mvnw -Dtest=TileServiceZoomPolicyTest test`

Expected: compilation failure because `firewallTiersForZoom` and mapper tier arguments do not exist yet.

### Task 2: Backend Policy Implementation

**Files:**
- Modify: `backend/src/main/java/com/topology/gis/tile/TileService.java`
- Modify: `backend/src/main/java/com/topology/gis/shared/mapper/NetworkElementMapper.java`
- Modify: `backend/src/main/resources/mapper/NetworkElementMapper.xml`

- [ ] **Step 1: Implement minimal backend policy**

Implement:

```java
static List<String> firewallTiersForZoom(int z) {
    if (z <= 7) return List.of("core");
    if (z <= 10) return List.of("aggregation", "core");
    return List.of();
}
```

Change `allowedTypesForZoom` so zooms 5-11 allow only `firewall`, zooms 12-13 allow `firewall/router/switch`, zooms 14-15 add `server`, and zoom 16+ adds `access-point`.

Add an effective filter helper that removes `networkTier` from JSON property filters, intersects user tier with zoom tier policy, returns empty when the intersection is impossible, and passes `networkTiers` into `findInTile` and `findIdsInTile`.

Update XML predicates:

```sql
AND (#{networkTiers}::text[] IS NULL OR properties ->> 'networkTier' = ANY(#{networkTiers}::text[]))
```

- [ ] **Step 2: Verify green**

Run: `cd backend && ./mvnw -Dtest=TileServiceZoomPolicyTest test`

Expected: `BUILD SUCCESS`.

### Task 3: Backend Heatmap Zoom Policy

**Files:**
- Modify: `backend/src/test/java/com/topology/gis/HeatmapControllerIntegrationTest.java`
- Modify: `backend/src/main/java/com/topology/gis/heatmap/HeatmapController.java`
- Modify: `backend/src/main/java/com/topology/gis/heatmap/HeatmapService.java`
- Modify: `backend/src/main/java/com/topology/gis/shared/mapper/HeatmapMapper.java`
- Modify: `backend/src/main/resources/mapper/HeatmapMapper.xml`

- [ ] **Step 1: Write failing heatmap tests**

Add an integration test that calls:

```java
GET /api/topology/heatmap?west=-180&south=-90&east=180&north=90&cols=24&rows=12&z=5
GET /api/topology/heatmap?west=-180&south=-90&east=180&north=90&cols=24&rows=12&z=11
```

Assert the z5 total is less than or equal to the z11 total and, after seed metadata is added, z5 reflects only core firewall rows.

- [ ] **Step 2: Verify red**

Run: `cd backend && ./mvnw -Dtest=HeatmapControllerIntegrationTest test`

Expected: failure because `z` is ignored and heatmap does not apply tier policy.

- [ ] **Step 3: Implement heatmap zoom policy**

Add `z` to controller/service, call `TileService.effectiveTypes` and the same tier filter helper, pass `networkTiers` to `HeatmapMapper`, and include `z` in cache keys.

- [ ] **Step 4: Verify green**

Run: `cd backend && ./mvnw -Dtest=HeatmapControllerIntegrationTest test`

Expected: `BUILD SUCCESS`.

### Task 4: Seed and Mock Data Metadata

**Files:**
- Modify: `backend/src/test/resources/test-data.sql`
- Modify: `backend/src/main/java/com/topology/gis/admin/SeedService.java`
- Modify: `backend/src/test/java/com/topology/gis/admin/SeedServiceTest.java`
- Modify: `frontend/src/mock/data-generator.ts`

- [ ] **Step 1: Write failing seed tests**

Extend `SeedServiceTest` to seed enough elements to include firewalls and assert firewall rows have `properties.networkTier` equal to `core`, `aggregation`, or `access`.

- [ ] **Step 2: Verify red**

Run: `cd backend && ./mvnw -Dtest=SeedServiceTest test`

Expected: assertion failure because admin seed firewalls do not include `networkTier`.

- [ ] **Step 3: Implement deterministic tiers**

Use firewall ordinal policy:

```text
ordinal % 1000 == 0 -> core
ordinal % 10 < 2    -> aggregation
otherwise           -> access
```

Apply the same policy in SQL generated rows, Java admin seed, and frontend mock generator.

- [ ] **Step 4: Verify green**

Run: `cd backend && ./mvnw -Dtest=SeedServiceTest test`

Expected: `BUILD SUCCESS`.

### Task 5: Frontend Visibility Policy and Mock Tile Handling

**Files:**
- Create: `frontend/src/utils/visibility-policy.ts`
- Modify: `frontend/src/mock/handlers.ts`
- Modify: `frontend/tests/unit/composables/use-tile-loader.test.ts`

- [ ] **Step 1: Write failing frontend policy tests**

Add tests for frontend policy helpers:

```ts
expect(allowedTypesForZoom(10)).toEqual(['firewall'])
expect(allowedNetworkTiersForZoom(5)).toEqual(['core'])
expect(allowedNetworkTiersForZoom(8)).toEqual(['aggregation', 'core'])
expect(allowedNetworkTiersForZoom(11)).toEqual([])
```

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm run test:unit -- tests/unit/composables/use-tile-loader.test.ts --run`

Expected: module/function missing failure.

- [ ] **Step 3: Implement frontend policy**

Create `visibility-policy.ts` with `allowedTypesForZoom`, `allowedNetworkTiersForZoom`, and `elementMatchesZoomPolicy`. Update mock handlers to filter both type and firewall tier.

- [ ] **Step 4: Verify green**

Run: `cd frontend && npm run test:unit -- tests/unit/composables/use-tile-loader.test.ts --run`

Expected: pass.

### Task 6: Overview Minimap Adaptive Heatmap

**Files:**
- Modify: `frontend/src/api/heatmap-service.ts`
- Modify: `frontend/src/components/OverviewMinimap.vue`
- Modify: `frontend/src/components/MapView.vue`
- Modify: `frontend/tests/unit/api/heatmap-service.test.ts`
- Modify: `frontend/tests/unit/components/overview-minimap.test.ts`
- Modify: `frontend/tests/unit/components/map-view.test.ts`

- [ ] **Step 1: Write failing tests**

Update heatmap service tests to expect `z=<floor zoom>` in query strings. Update overview minimap tests to expect heatmap bounds derived from input viewport bounds plus buffer, not fixed world bounds, and to expect `zoom` in the fetch query. Update MapView tests to verify `zoom` is passed to the minimap.

- [ ] **Step 2: Verify red**

Run:

```bash
cd frontend && npm run test:unit -- tests/unit/api/heatmap-service.test.ts tests/unit/components/overview-minimap.test.ts tests/unit/components/map-view.test.ts --run
```

Expected: tests fail because heatmap query is global and has no zoom.

- [ ] **Step 3: Implement adaptive minimap**

Add `zoom` to `DeviceHeatmapQuery`, include `z` in `buildDeviceHeatmapQuery`, add `zoom` prop to `OverviewMinimap`, compute viewport+buffer heatmap bounds, project heatmap cells within returned heatmap bounds, and pass `viewportStore.zoom` from `MapView`.

- [ ] **Step 4: Verify green**

Run:

```bash
cd frontend && npm run test:unit -- tests/unit/api/heatmap-service.test.ts tests/unit/components/overview-minimap.test.ts tests/unit/components/map-view.test.ts --run
```

Expected: pass.

### Task 7: Full Verification and Docker Deployment

**Files:**
- Verify all changed files.

- [ ] Run `cd frontend && npm run test:unit -- --run`; expected all frontend tests pass.
- [ ] Run `cd backend && ./mvnw test`; expected all backend tests pass. If sandbox blocks Docker/Testcontainers, rerun with Docker access approval.
- [ ] Run `cd backend && ./mvnw package -DskipTests -q`; expected JAR builds.
- [ ] Run `docker compose --profile seed build`; expected backend/frontend images build.
- [ ] Run `docker compose up -d --force-recreate backend frontend`; expected services healthy.
- [ ] Ask for explicit confirmation before reseeding the existing database because seed reload modifies local DB contents.
- [ ] Verify `http://localhost:8081` first opens with sparse core firewalls and no links.
