# Tile Display Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove clustering and add zoom-based type visibility so element density is controlled server-side while network connectivity is preserved at every zoom level.

**Architecture:** Delete `ClusteringService`, strip the clustering branch and `CLUSTER_ZOOM_THRESHOLD` guard from `TileService`/`TileController`, add `allowedTypesForZoom()` + `effectiveTypes()` static helpers that filter DB queries, and remove cluster layer rendering from the frontend.

**Tech Stack:** Java 21 / Spring Boot 3.3.4 / MyBatis Plus (backend); Vue 3 / deck.gl / TypeScript (frontend)

---

## File map

| File | Action |
|---|---|
| `backend/src/test/java/com/topology/gis/tile/TileServiceZoomPolicyTest.java` | **Create** — unit tests for `allowedTypesForZoom` and `effectiveTypes` |
| `backend/src/main/java/com/topology/gis/tile/TileService.java` | **Modify** — add zoom policy helpers, remove clustering |
| `backend/src/main/java/com/topology/gis/tile/TileController.java` | **Modify** — remove low-zoom guard on links endpoint |
| `backend/src/test/java/com/topology/gis/TileControllerIntegrationTest.java` | **Modify** — replace obsolete clusters test with zoom-policy assertion |
| `backend/src/main/java/com/topology/gis/tile/ClusteringService.java` | **Delete** |
| `frontend/src/composables/use-deck-layers.ts` | **Modify** — remove cluster ScatterplotLayer and TextLayer |
| `frontend/src/composables/use-tile-loader.ts` | **Modify** — remove `clusters.length` from elementCount |

---

## Task 1: Write failing unit tests for zoom policy

**Files:**
- Create: `backend/src/test/java/com/topology/gis/tile/TileServiceZoomPolicyTest.java`

- [ ] **Step 1: Write the failing tests**

```java
package com.topology.gis.tile;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class TileServiceZoomPolicyTest {

    // ── allowedTypesForZoom — interior values ──────────────────────────────────

    @Test
    void allowedTypesForZoom_zoom3_firewallOnly() {
        assertThat(TileService.allowedTypesForZoom(3))
                .containsExactlyInAnyOrder("firewall");
    }

    @Test
    void allowedTypesForZoom_zoom7_firewallAndRouter() {
        assertThat(TileService.allowedTypesForZoom(7))
                .containsExactlyInAnyOrder("firewall", "router");
    }

    @Test
    void allowedTypesForZoom_zoom10_firewallRouterSwitch() {
        assertThat(TileService.allowedTypesForZoom(10))
                .containsExactlyInAnyOrder("firewall", "router", "switch");
    }

    @Test
    void allowedTypesForZoom_zoom13_firewallRouterSwitchServer() {
        assertThat(TileService.allowedTypesForZoom(13))
                .containsExactlyInAnyOrder("firewall", "router", "switch", "server");
    }

    @Test
    void allowedTypesForZoom_zoom15_allFiveTypes() {
        assertThat(TileService.allowedTypesForZoom(15))
                .containsExactlyInAnyOrder("firewall", "router", "switch", "server", "access-point");
    }

    // ── allowedTypesForZoom — boundary values (off-by-one guards) ─────────────

    @ParameterizedTest(name = "zoom={0} -> {1}")
    @CsvSource({
        "5,  'firewall'",
        "6,  'firewall,router'",
        "8,  'firewall,router'",
        "9,  'firewall,router,switch'",
        "11, 'firewall,router,switch'",
        "12, 'firewall,router,switch,server'",
        "14, 'firewall,router,switch,server'",
        "15, 'firewall,router,switch,server,access-point'"
    })
    void allowedTypesForZoom_boundaries(int z, String expectedCsv) {
        Set<String> expected = Set.of(expectedCsv.split(","));
        assertThat(TileService.allowedTypesForZoom(z))
                .containsExactlyInAnyOrderElementsOf(expected);
    }

    // ── effectiveTypes — intersection rule ─────────────────────────────────────

    @Test
    void effectiveTypes_nullClientFilter_returnsZoomAllowed() {
        // zoom=10 allows firewall, router, switch
        List<String> result = TileService.effectiveTypes(10, null);
        assertThat(result).containsExactlyInAnyOrder("firewall", "router", "switch");
    }

    @Test
    void effectiveTypes_emptyClientFilter_returnsZoomAllowed() {
        List<String> result = TileService.effectiveTypes(10, List.of());
        assertThat(result).containsExactlyInAnyOrder("firewall", "router", "switch");
    }

    @Test
    void effectiveTypes_clientRequestsNotYetAllowedType_returnsEmpty() {
        // zoom=3 allows only firewall; client requests router → empty intersection
        List<String> result = TileService.effectiveTypes(3, List.of("router"));
        assertThat(result).isEmpty();
    }

    @Test
    void effectiveTypes_partialOverlap_returnsIntersection() {
        // zoom=10 allows firewall,router,switch; client requests router,server → only router
        List<String> result = TileService.effectiveTypes(10, List.of("router", "server"));
        assertThat(result).containsExactlyInAnyOrder("router");
    }

    @Test
    void effectiveTypes_clientRequestsAllAllowed_returnsFull() {
        // zoom=7 allows firewall,router; client requests same two
        List<String> result = TileService.effectiveTypes(7, List.of("firewall", "router"));
        assertThat(result).containsExactlyInAnyOrder("firewall", "router");
    }
}
```

- [ ] **Step 2: Run tests to verify they fail (compile error expected)**

```bash
cd backend && ./mvnw test -Dtest=TileServiceZoomPolicyTest -Dsurefire.failIfNoSpecifiedTests=false 2>&1 | tail -20
```

Expected: `COMPILATION ERROR` — `allowedTypesForZoom` and `effectiveTypes` not yet defined.

---

## Task 2: Add zoom policy helpers to TileService

**Files:**
- Modify: `backend/src/main/java/com/topology/gis/tile/TileService.java`

- [ ] **Step 1: Add the two static helper methods after the existing `toTypesParam` method (after line 77)**

Add between `toTypesParam` and `buildPropFilterJson`:

```java
/**
 * Returns the set of element types visible at the given zoom level.
 * Each tier adds one layer of the network hierarchy to control density
 * while preserving connectivity at every zoom.
 */
static Set<String> allowedTypesForZoom(int z) {
    if (z <= 5)  return Set.of("firewall");
    if (z <= 8)  return Set.of("firewall", "router");
    if (z <= 11) return Set.of("firewall", "router", "switch");
    if (z <= 14) return Set.of("firewall", "router", "switch", "server");
    return Set.of("firewall", "router", "switch", "server", "access-point");
}

/**
 * Computes the effective type list by intersecting the zoom-allowed set with the
 * client-requested types.
 *
 * Rules:
 *   - null or empty clientTypes → return all zoom-allowed types
 *   - non-empty clientTypes → return intersection (may be empty)
 */
static List<String> effectiveTypes(int z, List<String> clientTypes) {
    Set<String> allowed = allowedTypesForZoom(z);
    if (clientTypes == null || clientTypes.isEmpty()) return new ArrayList<>(allowed);
    return clientTypes.stream().filter(allowed::contains).toList();
}
```

- [ ] **Step 2: Run unit tests to verify they pass**

```bash
cd backend && ./mvnw test -Dtest=TileServiceZoomPolicyTest -Dsurefire.failIfNoSpecifiedTests=false 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`, all 10 tests pass.

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/test/java/com/topology/gis/tile/TileServiceZoomPolicyTest.java \
  src/main/java/com/topology/gis/tile/TileService.java
git commit -m "feat: add zoom-based type visibility helpers with unit tests"
```

---

## Task 3: Remove clustering from TileService

**Files:**
- Modify: `backend/src/main/java/com/topology/gis/tile/TileService.java`

- [ ] **Step 1: Remove `CLUSTER_ZOOM_THRESHOLD`, `ClusteringService` field + constructor injection, and the clustering branch from `getTileElements()`**

Remove line 24:
```java
public static final int CLUSTER_ZOOM_THRESHOLD = 12;
```

Remove line 33:
```java
private final ClusteringService clusteringService;
```

Replace the constructor (lines 36–44):
```java
// BEFORE:
public TileService(NetworkElementMapper elementMapper,
                   TopologyLinkMapper linkMapper,
                   ClusteringService clusteringService,
                   ObjectMapper objectMapper) {
    this.elementMapper = elementMapper;
    this.linkMapper = linkMapper;
    this.clusteringService = clusteringService;
    this.objectMapper = objectMapper;
}

// AFTER:
public TileService(NetworkElementMapper elementMapper,
                   TopologyLinkMapper linkMapper,
                   ObjectMapper objectMapper) {
    this.elementMapper = elementMapper;
    this.linkMapper = linkMapper;
    this.objectMapper = objectMapper;
}
```

Replace `getTileElements()` body (lines 92–112). Old body:
```java
public TileElementsResponse getTileElements(
        int z, int x, int y,
        List<String> types,
        Map<String, String> propFilters) {

    TileBBox bbox = tileToBBox(z, x, y);
    String typesParam = toTypesParam(types);
    String propFilter = buildPropFilterJson(propFilters);

    List<NetworkElement> entities = elementMapper.findInTile(
            bbox.west(), bbox.south(), bbox.east(), bbox.north(),
            typesParam, propFilter, TILE_ELEMENT_CAP);

    if (z < CLUSTER_ZOOM_THRESHOLD && !entities.isEmpty()) {
        List<TopologyClusterDto> clusters = clusteringService.cluster(entities, z, x, y, bbox);
        return new TileElementsResponse(List.of(), clusters, CURRENT_GENERATION, List.of());
    }

    List<NetworkElementDto> dtos = entities.stream().map(this::toDto).toList();
    return new TileElementsResponse(dtos, List.of(), CURRENT_GENERATION, List.of());
}
```

New body:
```java
public TileElementsResponse getTileElements(
        int z, int x, int y,
        List<String> types,
        Map<String, String> propFilters) {

    List<String> effective = effectiveTypes(z, types);
    if (effective.isEmpty() && (types != null && !types.isEmpty())) {
        // Client requested types that are all outside the zoom-allowed set → no DB call
        return new TileElementsResponse(List.of(), List.of(), CURRENT_GENERATION, List.of());
    }

    TileBBox bbox = tileToBBox(z, x, y);
    // effective may still be empty when no client filter was given — toTypesParam(null) triggers IS NULL in query
    String typesParam = toTypesParam(effective.isEmpty() ? null : effective);
    String propFilter = buildPropFilterJson(propFilters);

    List<NetworkElement> entities = elementMapper.findInTile(
            bbox.west(), bbox.south(), bbox.east(), bbox.north(),
            typesParam, propFilter, TILE_ELEMENT_CAP);

    List<NetworkElementDto> dtos = entities.stream().map(this::toDto).toList();
    return new TileElementsResponse(dtos, List.of(), CURRENT_GENERATION, List.of());
}
```

Apply the same zoom-policy filter to `getTileLinks()`. Replace the start of the method body (before the `tileToBBox` call):

Old start of `getTileLinks()`:
```java
public TileLinksResponse getTileLinks(
        int z, int x, int y,
        List<String> types,
        Map<String, String> propFilters) {

    TileBBox bbox = tileToBBox(z, x, y);
    String typesParam = toTypesParam(types);
    String propFilter = buildPropFilterJson(propFilters);
```

New start:
```java
public TileLinksResponse getTileLinks(
        int z, int x, int y,
        List<String> types,
        Map<String, String> propFilters) {

    List<String> effective = effectiveTypes(z, types);
    if (effective.isEmpty() && (types != null && !types.isEmpty())) {
        return new TileLinksResponse(List.of(), List.of(), CURRENT_GENERATION, List.of());
    }

    TileBBox bbox = tileToBBox(z, x, y);
    String typesParam = toTypesParam(effective.isEmpty() ? null : effective);
    String propFilter = buildPropFilterJson(propFilters);
```

Also remove the unused import at the top:
```java
import com.topology.gis.shared.dto.TopologyClusterDto;
```

- [ ] **Step 2: Compile to verify no errors**

```bash
cd backend && ./mvnw compile 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`

- [ ] **Step 3: Run unit tests**

```bash
cd backend && ./mvnw test -Dtest=TileServiceZoomPolicyTest -Dsurefire.failIfNoSpecifiedTests=false 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`, all 10 tests pass.

---

## Task 4: Remove low-zoom guard from TileController

**Files:**
- Modify: `backend/src/main/java/com/topology/gis/tile/TileController.java`

The links endpoint (lines 41–56) currently rejects requests at `z < 12`. With clustering gone, links are available at all zoom levels.

- [ ] **Step 1: Remove the guard block**

Remove lines 50–54 from `getTileLinks()`:
```java
if (z < TileService.CLUSTER_ZOOM_THRESHOLD) {
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Links endpoint is not available below zoom level " + TileService.CLUSTER_ZOOM_THRESHOLD
            + "; use the elements endpoint which returns clusters at low zoom");
}
```

The method body should now be:
```java
@GetMapping("/{z}/{x}/{y}/links")
public TileLinksResponse getTileLinks(
        @PathVariable @Min(0) @Max(22) int z,
        @PathVariable @Min(0) int x,
        @PathVariable @Min(0) int y,
        @RequestParam(value = "types", required = false, defaultValue = "") String typesParam,
        @RequestParam MultiValueMap<String, String> allParams) {

    validateTileCoordinates(z, x, y);
    return tileService.getTileLinks(z, x, y, parseTypes(typesParam), parsePropFilters(allParams));
}
```

Also remove the unused imports (if not already removed):
```java
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
```

- [ ] **Step 2: Compile to verify**

```bash
cd backend && ./mvnw compile 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`

- [ ] **Step 3: Commit backend changes so far**

```bash
cd backend && git add src/main/java/com/topology/gis/tile/TileService.java \
  src/main/java/com/topology/gis/tile/TileController.java
git commit -m "feat: apply zoom-based type policy, remove clustering from tile endpoints"
```

---

## Task 5: Update TileControllerIntegrationTest

**Files:**
- Modify: `backend/src/test/java/com/topology/gis/TileControllerIntegrationTest.java`

The test `tileElements_atLowZoom_returnsClusters` tests behaviour that no longer exists. Replace it with a test asserting the zoom policy: at z=8, only firewall and router types are returned as individual elements (never clusters).

- [ ] **Step 1: Replace the obsolete clusters test**

Old test (lines 36–53):
```java
@Test
void tileElements_atLowZoom_returnsClusters() {
    // z=8 is below threshold, should return clusters
    ResponseEntity<TileElementsResponse> resp = restTemplate.getForEntity(
            "/api/topology/tiles/8/128/85/elements", TileElementsResponse.class);

    assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    TileElementsResponse body = resp.getBody();
    assertThat(body).isNotNull();
    // If any elements fall in this tile, clusters should be returned
    if (!body.clusters().isEmpty()) {
        assertThat(body.elements()).isEmpty();
        body.clusters().forEach(c -> {
            assertThat(c.id()).matches("tile:8/\\d+/\\d+:q[0-3]");
            assertThat(c.count()).isPositive();
        });
    }
}
```

New test:
```java
@Test
void tileElements_atLowZoom_returnsOnlyZoomAllowedTypes() {
    // z=8 allows only firewall and router — no clusters, no switches/servers/access-points
    ResponseEntity<TileElementsResponse> resp = restTemplate.getForEntity(
            "/api/topology/tiles/8/128/85/elements", TileElementsResponse.class);

    assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    TileElementsResponse body = resp.getBody();
    assertThat(body).isNotNull();
    assertThat(body.clusters()).isEmpty();
    body.elements().forEach(el ->
            assertThat(el.type()).isIn("firewall", "router"));
}
```

Also update the comment in `tileElements_atHighZoom_returnsElements` to remove the stale reference to z=12 threshold:

Old comment:
```java
// z=12 is the threshold; z=14 should return individual elements
```

New comment:
```java
// z=14 allows firewall, router, switch, server (not access-point)
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add src/test/java/com/topology/gis/TileControllerIntegrationTest.java
git commit -m "test: update TileControllerIntegrationTest for zoom-policy behaviour"
```

---

## Task 6: Delete ClusteringService

**Files:**
- Delete: `backend/src/main/java/com/topology/gis/tile/ClusteringService.java`

- [ ] **Step 1: Delete the file**

```bash
rm backend/src/main/java/com/topology/gis/tile/ClusteringService.java
```

- [ ] **Step 2: Compile to verify no remaining references**

```bash
cd backend && ./mvnw compile 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`

- [ ] **Step 3: Run unit tests**

```bash
cd backend && ./mvnw test -Dtest=TileServiceZoomPolicyTest -Dsurefire.failIfNoSpecifiedTests=false 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`

- [ ] **Step 4: Commit**

```bash
git add -u backend/src/main/java/com/topology/gis/tile/ClusteringService.java
git commit -m "feat: delete ClusteringService — clustering fully removed"
```

---

## Task 7: Frontend — remove cluster layers from use-deck-layers.ts

**Files:**
- Modify: `frontend/src/composables/use-deck-layers.ts`

- [ ] **Step 1: Remove `TextLayer` from deck.gl import (line 2)**

Old:
```ts
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers'
```

New:
```ts
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers'
```

- [ ] **Step 2: Remove `TopologyCluster` from type import (line 9)**

Old:
```ts
import type { NetworkElement, TopologyLink, TopologyCluster } from '@/types/topology'
```

New:
```ts
import type { NetworkElement, TopologyLink } from '@/types/topology'
```

- [ ] **Step 3: Remove the cluster layer block (lines 123–152)**

Remove this entire block:
```ts
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
```

The `telemetry.emit('layer_rebuild_ms', ...)` line immediately after should remain.

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx vue-tsc --noEmit 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/composables/use-deck-layers.ts
git commit -m "feat: remove cluster layers from deck.gl rendering"
```

---

## Task 8: Frontend — fix elementCount in use-tile-loader.ts

**Files:**
- Modify: `frontend/src/composables/use-tile-loader.ts`

- [ ] **Step 1: Remove `clusters.length` from elementCount (line 213)**

Old:
```ts
      state.elementCount = elemResult.value!.elements.length + elemResult.value!.clusters.length
```

New:
```ts
      state.elementCount = elemResult.value!.elements.length
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx vue-tsc --noEmit 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/composables/use-tile-loader.ts
git commit -m "feat: remove clusters.length from tile element count"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Remove `CLUSTER_ZOOM_THRESHOLD` constant | Task 3 |
| Remove clustering branch and `ClusteringService` call from `getTileElements()` | Task 3 |
| Remove `ClusteringService` field and constructor injection | Task 3 |
| Delete `ClusteringService.java` | Task 6 |
| `clusters` field always `List.of()` | Task 3 (implicit — new path never sets clusters) |
| Remove cluster layers from `use-deck-layers.ts` | Task 7 |
| Fix `elementCount` in `use-tile-loader.ts` | Task 8 |
| Add `allowedTypesForZoom()` static method | Task 2+3 |
| Apply zoom policy in `getTileElements()` | Task 3 |
| Apply zoom policy in `getTileLinks()` | Task 3 |
| Empty intersection → early return, no DB call | Task 3 |
| Remove low-zoom guard from links endpoint | Task 4 |
| Unit tests — interior zoom values | Task 1 |
| Unit tests — boundary zoom values (off-by-one) | Task 1 |
| Unit tests — intersection rule (null, empty, partial, no-overlap) | Task 1 |
| Integration test updated for zoom policy | Task 5 |
