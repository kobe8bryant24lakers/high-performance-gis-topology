# Firewall Hierarchy and Adaptive Overview Heatmap Design

## Goal

Reduce default map density while keeping the network hierarchy understandable. On first open, the map should show only a small set of core firewall devices. As users zoom in, the app should progressively reveal lower firewall layers and then the rest of the device types. The overview minimap should follow the same visibility rules and show a heatmap for the current viewport plus nearby context.

## Current State

- Device tile loading starts at zoom 5.
- Zoom 5 currently allows all firewall devices, which can produce about 50,000 visible firewall elements across California.
- Tile links are already deferred until zoom 12.
- Region summary rendering has been removed from the main map.
- `OverviewMinimap.vue` currently requests a fixed global device heatmap at 48 by 24 cells and does not vary by viewport or zoom.
- Seeded firewall rows currently have no hierarchy metadata, so the backend cannot distinguish core, aggregation, and access firewalls.

## Firewall Hierarchy

Firewall devices will gain a deterministic `networkTier` property:

- `core`: top-level firewall anchors used for the first-open map.
- `aggregation`: middle layer firewalls revealed after users zoom in.
- `access`: detailed firewall layer revealed at higher device zooms.

Only firewall devices require this property in this scope. Other device types remain unchanged; extending hierarchy to routers, switches, servers, or access points is out of scope for this design.

Seed and mock data must generate the hierarchy deterministically so the same IDs produce the same tier after rebuilds and reseeds. The first-open target is 10 to 50 core firewall anchors across California. The exact count can be controlled by assigning only a small deterministic subset of firewall IDs to `networkTier=core`; the remaining firewall devices split between `aggregation` and `access`.

## Main Map Visibility

The tile visibility policy will become hierarchy-aware:

- Zoom 5 to 7: show only `firewall` devices where `networkTier=core`.
- Zoom 8 to 10: show `firewall` devices where `networkTier` is `core` or `aggregation`.
- Zoom 11: show all firewall devices.
- Zoom 12 to 13: show firewall, router, and switch devices; links may load starting at zoom 12.
- Zoom 14 to 15: add server devices.
- Zoom 16 and above: show all device types, including access points.

This preserves the existing device type progression while adding an earlier firewall hierarchy progression. It also keeps link loading deferred until detailed zooms.

The backend should enforce this policy so low-zoom responses are small at the source. Frontend mock handlers should mirror the backend policy for tests and local mocks.

## API Filtering

Tile and heatmap requests already support type filters and property filters. The implementation should use the existing `prop.*` mechanism for hierarchy where practical:

- Seeded firewall rows include `{"networkTier":"core"}` or equivalent tier values in `properties`.
- Backend tile policy injects tier filtering server-side based on zoom, instead of relying on the frontend to pass the correct `prop.networkTier`.
- User-supplied property filters continue to work. If a user explicitly filters `networkTier`, backend policy and user filter should combine by intersection.

The API response schema does not need to change because hierarchy is carried in `NetworkElement.properties`.

## Overview Minimap

The overview minimap should become viewport-aware:

- It requests heatmap bounds derived from the current map bounds plus a zoom-dependent buffer.
- At low zoom, the buffer is broad enough to show surrounding California context.
- At medium zoom, the buffer covers nearby operational context.
- At high zoom, the buffer is tight around the current viewport.

The heatmap should use the same zoom visibility policy as the main map:

- At zoom 5, the heatmap reflects core firewall density.
- At zoom 8 to 10, it reflects core and aggregation firewall density.
- At zoom 11, it reflects all firewall density.
- At zoom 12 and above, it follows the visible device type progression and user filters.

The minimap continues to render:

- A heatmap layer.
- A viewport rectangle.
- Cursor location when available.
- Click and drag navigation.

The minimap title/help text should make clear that it shows nearby visible-density context, not a fixed global device distribution.

## Data Sources

The following data generators must be kept aligned:

- Docker SQL seed data in `backend/src/test/resources/test-data.sql`.
- Backend local/admin seed data in `backend/src/main/java/com/topology/gis/admin/SeedService.java`.
- Frontend mock data in `frontend/src/mock/data-generator.ts` and mock tile handling in `frontend/src/mock/handlers.ts`.

The SQL seed should continue to use California-bounded coordinates and the existing type distribution. Only the firewall `properties` payload changes to include deterministic hierarchy.

## Testing

Backend tests:

- Tile zoom policy returns only core firewall at zoom 5.
- Tile zoom policy returns core and aggregation firewall at zoom 8 to 10.
- Tile zoom policy returns all firewall at zoom 11.
- Existing type progression remains intact at zoom 12 and above.
- Heatmap responses honor the same zoom-derived tier policy when used by the frontend path.
- Seed/admin-generated firewall elements include deterministic `networkTier` values.

Frontend tests:

- Tile loader and mock handlers expect sparse core firewall loading at default zoom.
- Overview minimap builds heatmap requests from viewport bounds plus a zoom-dependent buffer.
- Overview minimap heatmap queries include the same effective type/tier policy as the main map.
- Default map behavior still starts at California center and zoom 5.

Manual verification:

- Rebuild backend JAR and Docker images.
- Start/recreate backend and frontend containers.
- If SQL seed logic changed and existing DB data must be refreshed, reseed only after explicit confirmation because it modifies local database contents.
- Open `http://localhost:8081`.
- Verify first open shows only a small number of core firewalls and no links.
- Verify zooming in progressively reveals aggregation and access firewalls.
- Verify the overview minimap heatmap updates with viewport and zoom.

## Out of Scope

- Restoring region summary layers.
- Changing database table shape.
- Changing API response schemas.
- Drawing precise California border polygons.
- Adding hierarchy to non-firewall device types.
