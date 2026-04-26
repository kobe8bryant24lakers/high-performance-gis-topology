# Overview Minimap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small SVG overview minimap that shows device distribution, current viewport, current mouse location, and supports click/drag map navigation.

**Architecture:** Create `OverviewMinimap.vue` as an isolated component that fetches global city summaries with `RegionService`, renders SVG markers, and emits `navigate`. `MapView.vue` owns Mapbox integration, tracks mouse longitude/latitude, renders the minimap, and handles minimap navigation through the existing `flyTo()` function.

**Tech Stack:** Vue 3, Pinia, TypeScript, existing `RegionService`, Vitest, Vue Test Utils, SVG.

---

## File Structure

- Create `frontend/src/components/OverviewMinimap.vue`: SVG minimap UI, global city summary fetch, projection helpers, click/drag navigation.
- Create `frontend/tests/unit/components/overview-minimap.test.ts`: unit tests for rendering and navigation.
- Modify `frontend/src/components/MapView.vue`: track mouse location, render `OverviewMinimap`, route `navigate` events into `flyTo()`.
- Modify `frontend/tests/unit/components/map-view.test.ts`: verify `OverviewMinimap` is mounted and minimap navigation calls the map `flyTo` path.

## Tasks

### Task 1: Overview Minimap Component

**Files:**
- Create: `frontend/src/components/OverviewMinimap.vue`
- Create: `frontend/tests/unit/components/overview-minimap.test.ts`

- [ ] Write failing tests that mount `OverviewMinimap` with mocked `RegionService`, assert density points render, assert viewport/cursor markers render, and assert clicking the SVG emits `navigate`.
- [ ] Run `cd frontend && npm run test:unit -- tests/unit/components/overview-minimap.test.ts`; expected failures are missing component/module.
- [ ] Implement `OverviewMinimap.vue` with equirectangular projection helpers, global `z=8` region summary fetch, SVG density points, viewport rectangle, cursor marker, and click/drag navigation.
- [ ] Run `cd frontend && npm run test:unit -- tests/unit/components/overview-minimap.test.ts`; expected pass.

### Task 2: MapView Integration

**Files:**
- Modify: `frontend/src/components/MapView.vue`
- Modify: `frontend/tests/unit/components/map-view.test.ts`

- [ ] Write failing tests that verify `MapView` renders `OverviewMinimap` and reacts to a minimap `navigate` event by calling Mapbox `flyTo`.
- [ ] Run `cd frontend && npm run test:unit -- tests/unit/components/map-view.test.ts`; expected failures are missing minimap integration and navigation wiring.
- [ ] Import `OverviewMinimap`, track Mapbox `mousemove` longitude/latitude, render the component with `viewportStore.bounds` and the mouse position, and handle `@navigate` with `flyTo(lng, lat, currentZoom)`.
- [ ] Run `cd frontend && npm run test:unit -- tests/unit/components/map-view.test.ts`; expected pass.

### Task 3: Verification and Deployment

**Files:**
- Verify all frontend changes.

- [ ] Run `cd frontend && npm run test:unit`; expected all tests pass.
- [ ] Run `cd frontend && npm run type-check`; expected exit code 0.
- [ ] Run `cd frontend && npm run build`; expected exit code 0.
- [ ] Run `docker compose --profile seed build frontend`.
- [ ] Run `docker compose --profile seed up -d frontend`.
- [ ] Open `http://localhost:8081`, verify the minimap shows device distribution, viewport box, cursor marker, and click navigation.
