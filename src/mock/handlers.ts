import { http, HttpResponse } from 'msw'
import {
  generateElements,
  generateLinks,
  elementsInTile,
  generateClustersForTile,
  resetSeed,
} from './data-generator'
import type { NetworkElement, TileElementsResponse, TileLinksResponse } from '@/types/topology'

resetSeed(42)
let ALL_ELEMENTS = generateElements(5000)
let ALL_LINKS = generateLinks(ALL_ELEMENTS, 3000)

export function resetMockData(elementCount: number, linkCount?: number) {
  resetSeed(42)
  ALL_ELEMENTS = generateElements(elementCount)
  ALL_LINKS = generateLinks(ALL_ELEMENTS, linkCount ?? Math.floor(elementCount * 0.6))
}

function linksForElements(elements: NetworkElement[]) {
  const ids = new Set(elements.map((e) => e.id))
  return ALL_LINKS.filter((l) => ids.has(l.sourceId) || ids.has(l.targetId))
}

export const handlers = [
  http.get('/api/topology/tiles/:z/:x/:y/elements', ({ params }) => {
    const z = Number(params.z)
    const x = Number(params.x)
    const y = Number(params.y)
    const elements = elementsInTile(ALL_ELEMENTS, z, x, y)

    const CLUSTER_ZOOM_THRESHOLD = 12
    if (z < CLUSTER_ZOOM_THRESHOLD && elements.length > 0) {
      const clusters = generateClustersForTile(elements, z, x, y)
      const response: TileElementsResponse = {
        elements: [],
        clusters,
        generation: 1,
        removedIds: [],
      }
      return HttpResponse.json(response)
    }

    const response: TileElementsResponse = {
      elements,
      clusters: [],
      generation: 1,
      removedIds: [],
    }
    return HttpResponse.json(response)
  }),

  http.get('/api/topology/tiles/:z/:x/:y/links', ({ params }) => {
    const z = Number(params.z)
    const x = Number(params.x)
    const y = Number(params.y)
    const tileElements = elementsInTile(ALL_ELEMENTS, z, x, y)
    const tileLinks = linksForElements(tileElements)
    const tileElementIds = new Set(tileElements.map((e) => e.id))

    const stubs: { id: string; lng: number; lat: number }[] = []
    const seenStubs = new Set<string>()
    for (const link of tileLinks) {
      for (const endpointId of [link.sourceId, link.targetId]) {
        if (!tileElementIds.has(endpointId) && !seenStubs.has(endpointId)) {
          const el = ALL_ELEMENTS.find((e) => e.id === endpointId)
          if (el) {
            stubs.push({ id: el.id, lng: el.lng, lat: el.lat })
            seenStubs.add(endpointId)
          }
        }
      }
    }

    const response: TileLinksResponse = {
      links: tileLinks,
      stubs,
      generation: 1,
      removedLinkIds: [],
    }
    return HttpResponse.json(response)
  }),

  http.get('/api/topology/elements/:id', ({ params }) => {
    const element = ALL_ELEMENTS.find((e) => e.id === params.id)
    if (!element) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(element)
  }),

  http.get('/api/topology/search', ({ request }) => {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const limit = Number(url.searchParams.get('limit') ?? '20')
    const results = ALL_ELEMENTS.filter(
      (e) => e.label.toLowerCase().includes(q) || e.type.toLowerCase().includes(q),
    ).slice(0, limit)
    return HttpResponse.json({ results, total: results.length })
  }),
]
