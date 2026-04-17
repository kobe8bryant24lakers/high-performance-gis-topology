import { http, HttpResponse } from 'msw'
import {
  generateElements,
  generateLinks,
  elementsInTile,
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

function allowedTypesForZoom(z: number): Set<string> {
  if (z <= 5) return new Set(['firewall'])
  if (z <= 8) return new Set(['firewall', 'router'])
  if (z <= 11) return new Set(['firewall', 'router', 'switch'])
  if (z <= 14) return new Set(['firewall', 'router', 'switch', 'server'])
  return new Set(['firewall', 'router', 'switch', 'server', 'access-point'])
}

function effectiveTypes(z: number, requestedTypes: string[]): Set<string> {
  const allowed = allowedTypesForZoom(z)
  if (requestedTypes.length === 0) return allowed
  return new Set(requestedTypes.filter((type) => allowed.has(type)))
}

export const handlers = [
  http.get('/api/topology/tiles/:z/:x/:y/elements', ({ params, request }) => {
    const z = Number(params.z)
    const x = Number(params.x)
    const y = Number(params.y)
    const url = new URL(request.url)
    const requestedTypes = (url.searchParams.get('types') ?? '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0)
    const types = effectiveTypes(z, requestedTypes)
    if (requestedTypes.length > 0 && types.size === 0) {
      return HttpResponse.json({
        elements: [],
        clusters: [],
        generation: 1,
        removedIds: [],
      } satisfies TileElementsResponse)
    }
    const elements = elementsInTile(ALL_ELEMENTS, z, x, y).filter((el) => types.has(el.type))

    const response: TileElementsResponse = {
      elements,
      clusters: [],
      generation: 1,
      removedIds: [],
    }
    return HttpResponse.json(response)
  }),

  http.get('/api/topology/tiles/:z/:x/:y/links', ({ params, request }) => {
    const z = Number(params.z)
    const x = Number(params.x)
    const y = Number(params.y)
    const url = new URL(request.url)
    const requestedTypes = (url.searchParams.get('types') ?? '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0)
    const types = effectiveTypes(z, requestedTypes)
    if (requestedTypes.length > 0 && types.size === 0) {
      return HttpResponse.json({
        links: [],
        stubs: [],
        generation: 1,
        removedLinkIds: [],
      } satisfies TileLinksResponse)
    }

    const allById = new Map(ALL_ELEMENTS.map((e) => [e.id, e]))
    const tileElements = elementsInTile(ALL_ELEMENTS, z, x, y).filter((el) => types.has(el.type))
    const tileLinks = linksForElements(tileElements).filter((link) => {
      const src = allById.get(link.sourceId)
      const tgt = allById.get(link.targetId)
      return !!src && !!tgt && types.has(src.type) && types.has(tgt.type)
    })
    const tileElementIds = new Set(tileElements.map((e) => e.id))

    const stubs: { id: string; lng: number; lat: number }[] = []
    const seenStubs = new Set<string>()
    for (const link of tileLinks) {
      for (const endpointId of [link.sourceId, link.targetId]) {
        if (!tileElementIds.has(endpointId) && !seenStubs.has(endpointId)) {
          const el = allById.get(endpointId)
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

  http.get('/api/topology/elements/:id/neighbors', ({ params, request }) => {
    const id = params.id as string
    const element = ALL_ELEMENTS.find((e) => e.id === id)
    if (!element) return new HttpResponse(null, { status: 404 })

    const url = new URL(request.url)
    const depth = Math.min(Number(url.searchParams.get('depth') ?? '1'), 3)

    // BFS to collect neighbors up to depth
    const visited = new Set<string>([id])
    const resultElements: typeof ALL_ELEMENTS = []
    const resultLinks: typeof ALL_LINKS = []
    let frontier = [id]

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const nextFrontier: string[] = []
      for (const nodeId of frontier) {
        const connectedLinks = ALL_LINKS.filter(
          (l) => l.sourceId === nodeId || l.targetId === nodeId,
        )
        for (const link of connectedLinks) {
          if (!resultLinks.some((rl) => rl.id === link.id)) {
            resultLinks.push(link)
          }
          const neighborId = link.sourceId === nodeId ? link.targetId : link.sourceId
          if (!visited.has(neighborId)) {
            visited.add(neighborId)
            const neighbor = ALL_ELEMENTS.find((e) => e.id === neighborId)
            if (neighbor) {
              resultElements.push(neighbor)
              nextFrontier.push(neighborId)
            }
          }
        }
      }
      frontier = nextFrontier
    }

    return HttpResponse.json({ elements: resultElements, links: resultLinks })
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
