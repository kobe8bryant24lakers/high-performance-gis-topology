import { watch, onScopeDispose } from 'vue'
import { useViewportStore, type ViewportBounds, type TileCoord } from '@/stores/viewport'
import { useTopologyStore } from '@/stores/topology'
import { useFilterStore } from '@/stores/filter'
import { usePerformanceStore } from '@/stores/performance'
import { TileService } from '@/api/tile-service'
import { LruTileCache } from '@/utils/lru-tile-cache'
import { telemetry } from '@/utils/telemetry'

function lngToTileX(lng: number, zoom: number): number {
  const maxLng = 180 - 1e-9
  const clampedLng = Math.max(-180, Math.min(maxLng, lng))
  return Math.floor(((clampedLng + 180) / 360) * Math.pow(2, zoom))
}

function latToTileY(lat: number, zoom: number): number {
  const clampedLat = Math.max(-85.051129, Math.min(85.051129, lat))
  const latRad = (clampedLat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  )
}

function normalizeLng(lng: number): number {
  const normalized = ((lng + 180) % 360 + 360) % 360 - 180
  return normalized === 180 ? -180 : normalized
}

export function bboxToTiles(bounds: ViewportBounds, zoom: number): TileCoord[] {
  const z = Math.floor(zoom)
  const maxTile = Math.pow(2, z) - 1

  const yMin = Math.max(0, latToTileY(bounds.north, z))
  const yMax = Math.min(maxTile, latToTileY(bounds.south, z))
  if (yMin > yMax) return []

  const tiles: TileCoord[] = []

  const appendTileRange = (west: number, east: number) => {
    const xMin = Math.max(0, Math.min(maxTile, lngToTileX(west, z)))
    const xMax = Math.max(0, Math.min(maxTile, lngToTileX(east, z)))
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y })
      }
    }
  }

  if (bounds.east - bounds.west >= 360) {
    appendTileRange(-180, 180)
    return tiles
  }

  const west = normalizeLng(bounds.west)
  const east = normalizeLng(bounds.east)
  if (west <= east) {
    appendTileRange(west, east)
  } else {
    // Bounds crossing the antimeridian split into [west, 180) U [-180, east]
    appendTileRange(west, 180)
    appendTileRange(-180, east)
  }

  // Defensive dedupe in case clamped boundaries overlap at low zoom.
  const unique = new Set<string>()
  return tiles.filter((tile) => {
    const key = `${tile.z}/${tile.x}/${tile.y}`
    if (unique.has(key)) return false
    unique.add(key)
    return true
  })
}

export interface TileLoadState {
  elementsLoaded: boolean
  linksLoaded: boolean
  elementsInFlight: boolean
  linksInFlight: boolean
  elementCount: number
  elementRetryCount: number
  linkRetryCount: number
  nextElementRetryAt: number
  nextLinkRetryAt: number
}

const TILE_ENDPOINT_MAX_RETRIES = 5
const TILE_RETRY_BASE_DELAY_MS = 500
const TILE_RETRY_MAX_DELAY_MS = 30_000
const TILE_PROBE_INTERVAL_MS = 60_000

function tileKeyFromCoord(tile: TileCoord): string {
  return `${tile.z}/${tile.x}/${tile.y}`
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  // Handle non-DOMException abort shapes (wrapped fetch clients, polyfills)
  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'AbortError') return true
  return false
}

export function computeTileRetryDelayMs(retryCount: number): number {
  const exp = Math.max(0, retryCount - 1)
  return Math.min(TILE_RETRY_BASE_DELAY_MS * Math.pow(2, exp), TILE_RETRY_MAX_DELAY_MS)
}

export function computeVisibleElementCount(
  visibleTileKeys: Iterable<string>,
  tileStates: ReadonlyMap<string, TileLoadState>,
): number {
  let total = 0
  for (const key of visibleTileKeys) {
    const state = tileStates.get(key)
    if (!state || !state.elementsLoaded) continue
    total += state.elementCount
  }
  return total
}

export function computeStaleTileKeys(
  loadedTileKeys: Iterable<string>,
  visibleTileKeys: ReadonlySet<string>,
): string[] {
  const stale: string[] = []
  for (const key of loadedTileKeys) {
    if (!visibleTileKeys.has(key)) stale.push(key)
  }
  return stale
}

export function shouldFetchEndpoint(
  loaded: boolean,
  inFlight: boolean,
  nextRetryAt: number,
  now: number,
): boolean {
  return !loaded && !inFlight && now >= nextRetryAt
}

export function shouldUseDeviceTiles(zoom: number): boolean {
  return Math.floor(zoom) >= 5
}

export function shouldFetchTileLinks(zoom: number): boolean {
  return Math.floor(zoom) >= 12
}

function encodeTypeParamToken(token: string): string {
  return encodeURIComponent(token.trim().toLowerCase())
}

export function buildFilterQueryString(
  types: readonly string[],
  propertyFilters: Readonly<Record<string, string>>,
): string {
  const params: string[] = []
  const normalizedTypes = types
    .map(encodeTypeParamToken)
    .filter((token) => token.length > 0)
  if (normalizedTypes.length > 0) {
    params.push(`types=${normalizedTypes.join(',')}`)
  }
  for (const [key, value] of Object.entries(propertyFilters)) {
    params.push(`prop.${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  return params.length > 0 ? `?${params.join('&')}` : ''
}

export function useTileLoader() {
  const viewportStore = useViewportStore()
  const topologyStore = useTopologyStore()
  const filterStore = useFilterStore()
  const performanceStore = usePerformanceStore()
  const tileService = new TileService()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const tileCache = new LruTileCache(200, 200_000)
  const tileLoadStates = new Map<string, TileLoadState>()

  /** Build filter query string for tile fetch URLs */
  function filterQueryString(): string {
    return buildFilterQueryString(filterStore.criteria.types, filterStore.criteria.propertyFilters)
  }

  function evictTiles(tileKeys: string[]) {
    for (const key of tileKeys) {
      topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
      tileLoadStates.delete(key)
    }
  }

  function clearLoadedTiles() {
    for (const key of [...tileCache.keys()]) {
      topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
      tileCache.delete(key)
    }
    tileLoadStates.clear()
    if (topologyStore.nodeCount > 0 || topologyStore.edgeCount > 0 || topologyStore.clusterCount > 0) {
      topologyStore.clear()
    }
    performanceStore.visibleElementCount = 0
    telemetry.emit('visible_element_count', 0)
  }

  function visibleTileKeySet(tiles: TileCoord[] = viewportStore.visibleTiles): Set<string> {
    return new Set(tiles.map(tileKeyFromCoord))
  }

  function isTileStillVisible(tileKey: string): boolean {
    return visibleTileKeySet().has(tileKey)
  }

  function evictStaleTiles(visibleKeys: ReadonlySet<string>) {
    const cachedStaleKeys = computeStaleTileKeys(tileCache.keys(), visibleKeys)
    evictTiles(cachedStaleKeys)
    for (const key of cachedStaleKeys) {
      tileCache.delete(key)
    }

    for (const key of computeStaleTileKeys(tileLoadStates.keys(), visibleKeys)) {
      if (!tileCache.has(key)) {
        tileLoadStates.delete(key)
      }
    }
  }

  function getOrCreateTileState(tileKey: string): TileLoadState {
    const existing = tileLoadStates.get(tileKey)
    if (existing) return existing

    const created: TileLoadState = {
      elementsLoaded: false,
      linksLoaded: false,
      elementsInFlight: false,
      linksInFlight: false,
      elementCount: 0,
      elementRetryCount: 0,
      linkRetryCount: 0,
      nextElementRetryAt: 0,
      nextLinkRetryAt: 0,
    }
    tileLoadStates.set(tileKey, created)
    return created
  }

  function shouldAttemptTileLoad(tile: TileCoord, now: number): boolean {
    const tileKey = tileKeyFromCoord(tile)
    const state = tileLoadStates.get(tileKey)
    if (!state) return !tileCache.has(tileKey)

    const shouldFetchElements = shouldFetchEndpoint(
      state.elementsLoaded,
      state.elementsInFlight,
      state.nextElementRetryAt,
      now,
    )
    const shouldFetchLinks = shouldFetchTileLinks(tile.z)
      && shouldFetchEndpoint(
        state.linksLoaded,
        state.linksInFlight,
        state.nextLinkRetryAt,
        now,
      )

    return shouldFetchElements || shouldFetchLinks
  }

  function recordEndpointFailure(
    state: TileLoadState,
    endpoint: 'elements' | 'links',
    now: number,
  ) {
    if (endpoint === 'elements') {
      state.elementRetryCount += 1
      if (state.elementRetryCount >= TILE_ENDPOINT_MAX_RETRIES) {
        // Switch to slow probe interval instead of giving up permanently
        state.nextElementRetryAt = now + TILE_PROBE_INTERVAL_MS
        if (state.elementRetryCount === TILE_ENDPOINT_MAX_RETRIES) {
          telemetry.emit('tile_endpoint_max_retries', 1)
        }
        return
      }
      state.nextElementRetryAt = now + computeTileRetryDelayMs(state.elementRetryCount)
      return
    }

    state.linkRetryCount += 1
    if (state.linkRetryCount >= TILE_ENDPOINT_MAX_RETRIES) {
      state.nextLinkRetryAt = now + TILE_PROBE_INTERVAL_MS
      if (state.linkRetryCount === TILE_ENDPOINT_MAX_RETRIES) {
        telemetry.emit('tile_endpoint_max_retries', 1)
      }
      return
    }
    state.nextLinkRetryAt = now + computeTileRetryDelayMs(state.linkRetryCount)
  }

  function updateVisibleElementCount(tiles: TileCoord[] = viewportStore.visibleTiles) {
    const visibleKeys = tiles.map(tileKeyFromCoord)
    const count = computeVisibleElementCount(visibleKeys, tileLoadStates)
    performanceStore.visibleElementCount = count
    telemetry.emit('visible_element_count', count)
  }

  async function loadTile(tile: TileCoord, gen: number) {
    const tileKey = tileKeyFromCoord(tile)
    const state = getOrCreateTileState(tileKey)
    const now = Date.now()
    const fetchElements = shouldFetchEndpoint(
      state.elementsLoaded,
      state.elementsInFlight,
      state.nextElementRetryAt,
      now,
    )
    const fetchLinks = shouldFetchTileLinks(tile.z)
      && shouldFetchEndpoint(
        state.linksLoaded,
        state.linksInFlight,
        state.nextLinkRetryAt,
        now,
      )
    if (!fetchElements && !fetchLinks) return

    const qs = filterQueryString()
    const start = performance.now()

    state.elementsInFlight = fetchElements
    state.linksInFlight = fetchLinks

    let elemResult: PromiseSettledResult<Awaited<ReturnType<typeof tileService.fetchTileElements>>>
    let linkResult: PromiseSettledResult<Awaited<ReturnType<typeof tileService.fetchTileLinks>>>
    try {
      ;[elemResult, linkResult] = await Promise.allSettled([
        fetchElements
          ? tileService.fetchTileElements(tile.z, tile.x, tile.y, gen, qs)
          : Promise.resolve(null),
        fetchLinks
          ? tileService.fetchTileLinks(tile.z, tile.x, tile.y, gen, qs)
          : Promise.resolve(null),
      ])
    } finally {
      if (fetchElements) state.elementsInFlight = false
      if (fetchLinks) state.linksInFlight = false
    }

    telemetry.emit('tile_fetch_ms', performance.now() - start)

    const elemOk = fetchElements
      && elemResult.status === 'fulfilled'
      && !!elemResult.value
    if (elemOk && elemResult.status === 'fulfilled') {
      if (!isTileStillVisible(tileKey)) {
        tileLoadStates.delete(tileKey)
        return
      }
      topologyStore.mergeTileElements(tileKey, elemResult.value!)
      state.elementsLoaded = true
      state.elementRetryCount = 0
      state.nextElementRetryAt = 0
      state.elementCount = elemResult.value!.elements.length
    } else if (fetchElements && elemResult.status === 'rejected' && !isAbortError(elemResult.reason)) {
      recordEndpointFailure(state, 'elements', Date.now())
    }

    const linkOk = fetchLinks
      && linkResult.status === 'fulfilled'
      && !!linkResult.value
    if (linkOk && linkResult.status === 'fulfilled') {
      if (!isTileStillVisible(tileKey)) {
        tileLoadStates.delete(tileKey)
        return
      }
      topologyStore.mergeTileLinks(tileKey, linkResult.value!)
      state.linksLoaded = true
      state.linkRetryCount = 0
      state.nextLinkRetryAt = 0
    } else if (fetchLinks && linkResult.status === 'rejected' && !isAbortError(linkResult.reason)) {
      recordEndpointFailure(state, 'links', Date.now())
    }

    // Cache tiles as soon as we have any successful payload to avoid uncapped hot-loop retries.
    // Retry scheduling for failed endpoints is tracked separately in tileLoadStates.
    if (elemOk || linkOk) {
      const evicted = tileCache.touch(tileKey, state.elementCount)
      evictTiles(evicted)
    }

    updateVisibleElementCount()
  }

  function loadVisibleTiles() {
    if (!viewportStore.bounds) return
    if (!shouldUseDeviceTiles(viewportStore.zoom)) {
      clearLoadedTiles()
      return
    }

    const tiles = viewportStore.visibleTiles
    const visibleKeys = visibleTileKeySet(tiles)
    evictStaleTiles(visibleKeys)

    const now = Date.now()
    const tilesToLoad = tiles.filter((t) => shouldAttemptTileLoad(t, now))
    const gen = tilesToLoad.length > 0
      ? tileService.nextGeneration()
      : tileService.currentGeneration()
    for (const tile of tilesToLoad) {
      loadTile(tile, gen).catch(() => {})
    }

    updateVisibleElementCount(tiles)
  }

  /** Force reload all tiles (e.g. when filters change) */
  function reloadAllTiles() {
    if (!shouldUseDeviceTiles(viewportStore.zoom)) {
      clearLoadedTiles()
      return
    }
    // Evict stale data from topology store before clearing cache
    for (const key of [...tileCache.keys()]) {
      topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
      tileCache.delete(key)
    }
    tileLoadStates.clear()
    loadVisibleTiles()
  }

  function onViewportChange() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(loadVisibleTiles, 200)
  }

  // Watch viewport changes
  watch(
    () => [viewportStore.bounds, viewportStore.zoom],
    onViewportChange,
    { deep: true },
  )

  // Watch filter changes — reload tiles when filters change
  watch(
    () => [filterStore.criteria.types, filterStore.criteria.propertyFilters],
    () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(reloadAllTiles, 200)
    },
    { deep: true },
  )

  // Memory pressure: aggressive eviction under pressure
  watch(
    () => performanceStore.memoryPressure,
    (pressure) => {
      if (pressure === 'critical') {
        // Keep only tiles in the current viewport
        const currentKeys = new Set(
          viewportStore.visibleTiles.map((t) => `${t.z}/${t.x}/${t.y}`),
        )
        for (const key of [...tileCache.keys()]) {
          if (!currentKeys.has(key)) {
            topologyStore.evictTile(key, performanceStore.pinnedNodeIds)
            tileCache.delete(key)
            tileLoadStates.delete(key)
          }
        }
        updateVisibleElementCount()
      }
    },
  )

  // Poll heap usage (Chrome-only, best-effort)
  let heapInterval: ReturnType<typeof setInterval> | null = null
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    heapInterval = setInterval(() => {
      const mem = (performance as any).memory
      if (mem?.usedJSHeapSize) {
        const mb = mem.usedJSHeapSize / (1024 * 1024)
        performanceStore.updateHeapMb(mb)
        telemetry.emit('heap_mb', mb)
      }
    }, 5000)
  }

  // Retry scheduler: periodically check for visible tiles with pending retries
  const retryTickInterval = setInterval(() => {
    if (!viewportStore.bounds) return
    if (!shouldUseDeviceTiles(viewportStore.zoom) || !shouldFetchTileLinks(viewportStore.zoom)) return
    const now = Date.now()
    const tiles = viewportStore.visibleTiles
    const pendingRetries = tiles.filter((t) => {
      const key = tileKeyFromCoord(t)
      const state = tileLoadStates.get(key)
      if (!state) return false
      const needsElem = !state.elementsLoaded
        && now >= state.nextElementRetryAt
        && state.nextElementRetryAt > 0
      const needsLinks = !state.linksLoaded
        && now >= state.nextLinkRetryAt
        && state.nextLinkRetryAt > 0
      return needsElem || needsLinks
    })
    if (pendingRetries.length > 0) {
      // Retries should not invalidate in-flight same-viewport responses.
      const gen = tileService.currentGeneration()
      for (const tile of pendingRetries) {
        loadTile(tile, gen).catch(() => {})
      }
    }
  }, 2000)

  function dispose() {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (heapInterval) clearInterval(heapInterval)
    clearInterval(retryTickInterval)
    tileService.cancelAll()
  }

  onScopeDispose(dispose)

  return { loadVisibleTiles, tileCache, dispose }
}
