# Tile Display Optimization Design

**Date:** 2026-04-16
**Status:** Approved

## Goals

1. Remove clustering — display individual elements at all zoom levels.
2. Zoom-based type visibility — show device types progressively as the user zooms in, controlling element density while preserving network integrity when no client type filter is active.

## Non-Goals

- Frontend viewport rendering filter (excluded after analysis: `LruTileCache(200, 200_000)` already caps the in-memory graph at 200 K elements; deck.gl handles this volume efficiently).
- Changing the tile-fetching protocol or URL structure.
- Modifying search or neighbor endpoints.

---

## Optimization 1 — Remove Clustering

### Current behaviour

`TileService.getTileElements()` checks `z < CLUSTER_ZOOM_THRESHOLD (12)`. When true it delegates to `ClusteringService.cluster()` and returns `TopologyClusterDto` objects instead of individual elements. The frontend renders these as yellow circles with count labels.

### Target behaviour

Always return individual `NetworkElementDto` objects regardless of zoom level. No clusters are ever produced or rendered.

### Response contract

The `TileElementsResponse` DTO retains the `clusters` field but it is always returned as an empty list. This preserves backward compatibility for any downstream client that currently reads the field, and makes rollback (re-enabling the clustering branch) a zero-risk one-line change.

### Backend changes

**`TileService.java`**
- Delete the `CLUSTER_ZOOM_THRESHOLD` constant.
- Remove the `if (z < CLUSTER_ZOOM_THRESHOLD && !entities.isEmpty())` branch and the `ClusteringService` call.
- `getTileElements()` always maps entities → `NetworkElementDto` list; `clusters` is always `List.of()`.
- The `ClusteringService` field and constructor injection are removed.

**`ClusteringService.java`** — deleted entirely.

### Frontend changes (Optimization 1 only)

**`use-deck-layers.ts`**
- Remove the cluster `ScatterplotLayer` (id `clusters`) and `TextLayer` (id `cluster-labels`).
- Remove the `getClusters()` call and the `clusters` variable.
- Remove unused `TopologyCluster` import if no longer referenced elsewhere.

**`use-tile-loader.ts`**
- `state.elementCount = elemResult.value!.elements.length + elemResult.value!.clusters.length`
  → `state.elementCount = elemResult.value!.elements.length`

---

## Optimization 2 — Zoom-Based Type Visibility

### Design rationale

The network is a hierarchy. Revealing device types layer-by-layer as the user zooms in gives two properties:

1. **Element count control** — fewer, higher-value devices appear at coarse zoom where the viewport covers a large geographic area.
2. **Network integrity** — when no client type filter is active, each tier includes all types needed to form a connected sub-network: firewalls connect to routers, routers to switches, switches to servers and access-points. This guarantee does not hold when a restrictive client type filter removes connector types; such a filter is accepted and returns a partial (potentially disconnected) view.

### Zoom tier table

Element pool estimates are derived from the 1 M-element test dataset (type distribution: access-point 40 %, switch 30 %, server 15 %, router 10 %, firewall 5 %).

| Zoom  | Types visible             | Cumulative pool  | Added layer         |
|-------|--------------------------|------------------|---------------------|
| 1–5   | firewall                 | ~50 K  (5 %)    | Network perimeter   |
| 6–8   | + router                 | ~150 K (15 %)   | Core backbone       |
| 9–11  | + switch                 | ~450 K (45 %)   | Distribution layer  |
| 12–14 | + server                 | ~600 K (60 %)   | Server infrastructure |
| 15+   | + access-point           | ~1 M   (100 %)  | Full detail         |

### Type intersection rule

The effective type set = **zoom-allowed types ∩ client-requested types**.

- **No client filter (`types` absent or null):** zoom-allowed types are used directly.
- **Empty client filter (`types=[]`):** treated identically to absent — zoom-allowed types are used directly.
- **Non-empty client filter:** intersection is computed. Types in the client list that are not zoom-allowed are silently dropped. If the intersection is empty the endpoint returns an empty response immediately without hitting the DB.
- **Invalid tokens:** rejected by the existing `toTypesParam()` validation (regex `^[a-zA-Z0-9_-]+$`), which runs before the intersection step.

### No additional frontend changes for Optimization 2

The zoom value `z` is already embedded in the tile URL (`/api/topology/tiles/{z}/{x}/{y}/elements`). The backend applies the zoom policy transparently. The frontend continues to send its optional user-facing type filter unchanged. (Frontend changes listed above apply to Optimization 1 only.)

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
2. Normalise the client filter: treat null and empty list identically as "no filter".
3. If client filter is present (non-empty after normalisation): compute intersection with `zoomAllowed`. If the intersection is empty, return an empty response immediately (no DB call).
4. Build `typesParam` from the effective set using the existing `toTypesParam()` helper. The set is always non-empty at this point.

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

**`allowedTypesForZoom` — interior values:**
- zoom=3 → `{firewall}`
- zoom=7 → `{firewall, router}`
- zoom=10 → `{firewall, router, switch}`
- zoom=13 → `{firewall, router, switch, server}`
- zoom=15 → all five types

**`allowedTypesForZoom` — boundary values (off-by-one guards):**
- zoom=5 → `{firewall}`; zoom=6 → `{firewall, router}`
- zoom=8 → `{firewall, router}`; zoom=9 → `{firewall, router, switch}`
- zoom=11 → `{firewall, router, switch}`; zoom=12 → `{firewall, router, switch, server}`
- zoom=14 → `{firewall, router, switch, server}`; zoom=15 → all five types

**Intersection rule:**
- zoom=3, client=`[router]` → empty response, no DB call
- zoom=10, client=`[router, server]` → effective = `{router}` (server not yet allowed)
- zoom=10, client=`[]` → treated as no filter → effective = zoom-allowed set
- zoom=10, client=null → effective = zoom-allowed set

### Existing integration tests

`TileControllerIntegrationTest` uses tile `14/8192/5460` (z=14), which allows all types except access-point per the zoom policy. The 10 fixed tile elements in `test-data.sql` are: 2 router, 3 switch, 1 server, 4 access-point. At z=14, the 4 access-points are excluded → 6 elements returned. All existing assertions that checked `clusters().isEmpty()` trivially pass since the field is now always empty. No seed data changes are required.
