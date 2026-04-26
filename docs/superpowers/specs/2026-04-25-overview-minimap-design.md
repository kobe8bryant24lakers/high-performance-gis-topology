# Overview Minimap Design

## Goal

Add a fixed overview minimap to the map view so users can find device-dense areas without using search when high zoom viewports contain no devices.

## Design

The minimap is a small SVG overlay in the lower-right corner of `MapView`. It fetches global city-level region summaries with `z=8` and world bounds through the existing `/api/topology/regions/summary` endpoint, so it never loads the full device dataset. Each city summary is rendered as a density point whose size and opacity are based on `totalCount`.

The minimap renders three navigation signals:

- Global device distribution from city summaries.
- Current main map viewport as a rectangular outline.
- Current main map mouse position as a crosshair marker.

Clicking or dragging inside the minimap emits a `navigate` event with longitude and latitude. `MapView` handles this by calling the existing `flyTo()` method while preserving the current zoom. Mouse movement in the main Mapbox map updates a local `{ lng, lat }` ref and passes it to the minimap.

## Constraints

- Do not load individual devices for the minimap.
- Keep the minimap independent from deck.gl layers.
- Keep pointer events local to the minimap and do not interfere with main map dragging.
- Respect active type and property filters when fetching minimap summaries.
- Continue to support the existing high-zoom empty viewport guide.

## Testing

- Unit test projection helpers for coordinate-to-SVG mapping.
- Unit test minimap rendering of density points, viewport rectangle, and cursor marker.
- Unit test click navigation emits the expected longitude/latitude.
- Unit test `MapView` renders the minimap and wires navigation to `flyTo`.
