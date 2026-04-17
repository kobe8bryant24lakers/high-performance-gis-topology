# Tile Display Optimization Design

**Date:** 2026-04-16
**Status:** Approved

## Goals

1. Remove clustering — display individual elements at all zoom levels.
2. Zoom-based type visibility — show device types progressively as the user zooms in, controlling element density while preserving network integrity.

## Non-Goals

- Frontend viewport rendering filter (excluded after analysis: LRU cache already caps the graph at 200 K elements; deck.gl handles this efficiently).
- Changing the tile-fetching protocol or URL structure.
- Modifying search or neighbor endpoints.

---

## Optimization 1 — Remove Clustering

### Current behaviour

`TileService.getTileElements()` checks `z < CLUSTER_ZOOM_THRESHOLD (12)`. When true it delegates to `ClusteringService.cluster()` and returns `TopologyClusterDto` objects instead of individual elements. The frontend renders these as yellow circles with count labels.

### Target behaviour

Always return individual `NetworkElementDto` objects regardless of zoom level. No clusters are ever produced or rendered.

### Backend changes

**`TileService.java`**
- Delete the `CLUSTER_ZOOM_THRESHOLD` constant.
- Remove the `if (z < CLUSTER_ZOOM_THRESHOLD && !entities.isEmpty())` branch and the `ClusteringService` call.
- `getTileElements()` always maps entities → `NetworkElementDto` list.
- The `ClusteringService` field and constructor injection are removed.

**`ClusteringService.java`** — deleted entirely.

### Frontend changes

**`use-deck-layers.ts`**
- Remove the cluster `ScatterplotLayer` (id `clusters`) and `TextLayer` (id `cluster-labels`).
- Remove the `getClusters()` call and the `clusters` variable.
- Import of `TopologyCluster` type removed if no longer referenced.

**`use-tile-loader.ts`**
- Line `state.elementCount = elemResult.value!.elements.length + elemResult.value!.clusters.length`
  → `state.elementCount = elemResult.value!.elements.length`

---

## Optimization 2 — Zoom-Based Type Visibility

### Design rationale

The network is a hierarchy. Revealing device types layer-by-layer as the user zooms in gives two properties:

1. **Element count control** — fewer, higher-value devices appear at coarse zoom where the viewport is large.
2. **Network integrity** — each tier includes all types needed to form a connected sub-network: firewalls connect to routers, routers to switches, switches to servers, servers/switches to access-points.

### Zoom tier table

| Zoom | Types visible | Cumulative pool | Added layer |
|------|--------------|-----------------|-------------|
| 1–5  | firewall | ~50 K (5 %) | Network perimeter |
| 6–8  | + router | ~150 K (15 %) | Core backbone |
| 9–11 | + switch | ~450 K (45 %) | Distribution layer |
| 12–14 | + server | ~600 K (60 %) | Server infrastructure |
| 15+  | + access-point | ~1 M (100 %) | Full detail |

### Type intersection rule

The effective type set = **zoom-allowed types ∩ client-requested types**.

- If the client sends no type filter: zoom-allowed types are used directly.
- If the client sends a type filter (e.g. `types=router`): only types present in both sets are queried. A client filter that selects types not visible at the current zoom returns an empty result — this is correct and intentional.

### Backend changes

**`TileService.java`**

Add a package-private static method:

```java
static Set<String> allowedTypesForZoom(int z) {
    if (z <= 5)  return Set.of("firewall");
    if (z <= 8)  return Set.of("firewall", "router");
    if (z <= 11) return Set.of("firewall", "router", "switch");
    if (z <= 14) return Set.of("firewall", "router", "switch", "server");
    return Set.of("firewall", "router", "switch", "server", "access-point");
}
```

Modify `getTileElements()` and `getTileLinks()`:

1. Compute `zoomAllowed = allowedTypesForZoom(z)`.
2. If `types` (client filter) is non-null: compute intersection. If the intersection is empty, return an empty response immediately without hitting the DB.
3. Build `typesParam` from the effective set (always non-empty after the intersection guard).

The existing `toTypesParam(List<String>)` helper is reused for the effective set.

### No frontend changes required

The zoom value `z` is already embedded in the tile URL (`/api/topology/tiles/{z}/{x}/{y}/elements`). The backend applies the policy transparently. The frontend continues to send its optional user-facing type filter unchanged.

---

## Affected files

| File | Action |
|------|--------|
| `backend/.../tile/TileService.java` | Modify — remove clustering branch, add zoom policy |
| `backend/.../tile/ClusteringService.java` | Delete |
| `frontend/src/composables/use-deck-layers.ts` | Modify — remove cluster layers |
| `frontend/src/composables/use-tile-loader.ts` | Modify — remove `clusters.length` from element count |

---

## Testing

### Backend unit tests (new)

- `allowedTypesForZoom(3)` → `{firewall}`
- `allowedTypesForZoom(7)` → `{firewall, router}`
- `allowedTypesForZoom(10)` → `{firewall, router, switch}`
- `allowedTypesForZoom(13)` → `{firewall, router, switch, server}`
- `allowedTypesForZoom(15)` → all five types
- Intersection: zoom=3, client=`[router]` → empty response (no DB call)
- Intersection: zoom=10, client=`[router, server]` → effective = `{router}` only

### Existing integration tests

`TileControllerIntegrationTest` uses tile `14/8192/5460` (z=14) which allows all types except access-point per the zoom policy. The 10 fixed tile elements in test-data.sql are: 2 router, 3 switch, 1 server, 4 access-point. At z=14, access-points are excluded → 6 elements visible in that tile. All assertions that previously checked `clusters().isEmpty()` trivially pass since clustering is removed. No seed count changes are required — the existing SQL test data already supports the expected results.
