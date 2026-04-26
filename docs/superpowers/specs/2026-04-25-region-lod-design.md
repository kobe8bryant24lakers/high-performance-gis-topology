# Region LOD Map Design

**Date:** 2026-04-25
**Status:** Approved for implementation planning

## Goal

Introduce administrative regions into the map so coarse zoom levels show country, province, or city summaries with per-device-type counts and virtual region-to-region links. Detailed zoom levels continue to show individual devices with the existing SVG NE icon system, viewport tile loading, and zoom-based device type layers.

## Context

The current map has only one geographic mode. It uses a flat Mapbox `mercator` projection, viewport-driven tile loading, Deck.gl layers, SVG NE icons, and backend zoom-based device type visibility.

The previous tile optimization removed generic clustering and made the backend return individual elements at all zoom levels. This design reintroduces summarization, but with business meaning: summaries are administrative regions, not arbitrary tile clusters.

## Zoom Behavior

| Zoom | Rendered layer | Data shown |
| --- | --- | --- |
| `z 0-3` | Country region layer | Countries, device type totals, country-to-country virtual links |
| `z 4-6` | Province region layer | Provinces, device type totals, province-to-province virtual links |
| `z 7-9` | City region layer | Cities, device type totals, city-to-city virtual links |
| `z 10-11` | Device layer | `firewall`, `router`, `switch` devices and real links |
| `z 12-14` | Device layer | `firewall`, `router`, `switch`, `server` devices and real links |
| `z 15+` | Device layer | All five device types and real links |

At `z <= 9`, the frontend does not fetch or render individual device tile data. At `z >= 10`, the frontend clears region summaries and uses the existing tile element/link APIs.

## Region Model

Add a formal administrative region model instead of deriving regions from ad hoc tile grids.

`regions` stores the hierarchy:

```text
id
level              country | province | city
name
parent_id          null for countries
centroid_lng
centroid_lat
bbox_west
bbox_south
bbox_east
bbox_north
geom               geometry polygon or multipolygon, 4326
```

`network_elements` gets explicit region assignment columns for fast aggregation:

```text
country_region_id
province_region_id
city_region_id
```

For seeded data, every generated device belongs to one city, and the country/province columns are filled from that city lineage. Real imported data can follow the same rule.

Indexes:

```text
regions(level)
regions(parent_id)
regions geom GiST
network_elements(country_region_id)
network_elements(province_region_id)
network_elements(city_region_id)
```

## Region Summary API

Add a viewport-scoped region summary endpoint:

```text
GET /api/topology/regions/summary
  ?z={zoom}
  &west={lng}
  &south={lat}
  &east={lng}
  &north={lat}
  &types={csv}
  &prop.{key}={value}
```

Response:

```typescript
interface RegionSummaryResponse {
  level: 'country' | 'province' | 'city'
  regions: RegionSummary[]
  links: RegionVirtualLink[]
  generation: number
}

interface RegionSummary {
  id: string
  level: 'country' | 'province' | 'city'
  name: string
  parentId: string | null
  centroidLng: number
  centroidLat: number
  bbox: {
    west: number
    south: number
    east: number
    north: number
  }
  totalCount: number
  elementTypes: {
    firewall: number
    router: number
    switch: number
    server: number
    'access-point': number
  }
  internalLinkCount: number
}

interface RegionVirtualLink {
  id: string
  sourceRegionId: string
  targetRegionId: string
  count: number
}
```

The endpoint maps zoom to region level with the same ladder used by the frontend. For `z >= 10`, the endpoint returns an empty region response; the frontend should not call it in normal operation.

## Viewport Semantics

The API returns only regions visible in the current viewport. A region is visible when its geometry or bounding box intersects the viewport.

Region counts are full-region counts, not clipped partial counts. For example, if part of a province is visible, the province card shows the province's total devices. This keeps the low-zoom mental model administrative instead of tile-based.

Virtual links are returned only when both endpoint regions are visible. This avoids drawing lines to offscreen summaries.

## Virtual Region Links

At low zoom, real device links are aggregated into region-to-region links at the active region level:

```text
source device -> source region at active level
target device -> target region at active level
group by source region + target region
count links
```

For undirected links, the region pair is normalized so `A-B` and `B-A` become the same virtual link. Directed device links can still contribute to the count, but the first implementation renders virtual region links without arrows.

If both endpoints belong to the same active region, the link increments that region's `internalLinkCount` and is not rendered as an external line.

Virtual link width is mapped from `count`, with a clamp so one high-volume pair does not dominate the map. The label uses compact formatting such as `18.2k links`.

## Filtering

Type filters and `prop.*` filters apply to region summaries.

Region device counts include only devices matching the active filters. Virtual region links include only links where both endpoint devices match the active filters. With no user filter, all five device types are included in the region summary layer.

This rule is intentionally stricter than the device tile link endpoint because region summaries are aggregate statistics. A virtual link should represent the same filtered population shown in the region cards.

## Frontend Rendering

Add a region summary loading path beside the existing tile loader:

- `z <= 9`: load region summaries for the viewport, render region layers, and clear device tiles.
- `z >= 10`: dispose region summaries, load device tiles, and render device layers.

Deck.gl layer stack for region mode:

- `LineLayer` for virtual region links.
- `TextLayer` with background for compact region cards.
- Optional lightweight boundary layer using region bounding boxes or geometry outlines.

Region cards show:

```text
Region name
total device count
FW / RT / SW / SRV / AP counts
```

Clicking a region selects it and opens the side panel with the full count breakdown and `internalLinkCount`. Hover highlights connected virtual links.

## Backend Aggregation

The region service resolves `z` to the active region column:

```text
country  -> country_region_id
province -> province_region_id
city     -> city_region_id
```

Device counts are grouped by active region and device type. Internal link counts and virtual region links are computed by joining link endpoints to the active region columns.

The service should use a short TTL cache similar to tile responses. Cache keys include:

```text
level
viewport bbox
types filter
property filter
generation
```

## Seed Data

The seeded dataset should include a deterministic region hierarchy:

- Several countries.
- Several provinces under each country.
- Several cities under each province.
- All one million devices assigned to city regions with stable, repeatable distribution.

Region geometry can be synthetic rectangles for the seeded demo dataset. The important property is deterministic hierarchy and repeatable counts, not real-world borders.

## Non-Goals

- Do not restore arbitrary tile clustering.
- Do not render individual devices at `z <= 9`.
- Do not render low-zoom internal region links as loops.
- Do not add 3D map behavior.
- Do not require real-world administrative boundary import in the first implementation.

## Testing

Backend tests:

- Zoom-to-region-level mapping: `z=2 -> country`, `z=5 -> province`, `z=8 -> city`, `z=10 -> no region layer`.
- Region summary returns only visible regions.
- Region type counts sum to `totalCount`.
- Type filter changes region counts and virtual link counts.
- Region internal links are counted but not returned as external links.
- Undirected links between the same pair of regions are normalized into one virtual link.

Frontend tests:

- `z <= 9` chooses region summary loading and does not call device tile loading.
- `z >= 10` chooses device tile loading and clears region summaries.
- Region layers include virtual links and region card text.
- Type filters are passed to the region summary API.

Manual Docker verification:

- At low zoom, the map shows country/province/city region summaries and virtual links.
- At high zoom, the map switches to individual SVG device icons and real links.
- Panning clips offscreen regions and virtual links.
- Type filters affect both low-zoom region summaries and high-zoom device layers.
