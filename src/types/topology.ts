// --- Domain Types ---

export interface NetworkElement {
  id: string
  type: string
  label: string
  lng: number
  lat: number
  version: number
  updatedAt: string
  properties: Record<string, unknown>
}

export interface TopologyLink {
  id: string
  type: string
  sourceId: string
  targetId: string
  directed: boolean
  weight?: number
  status?: string
  version: number
  updatedAt: string
  properties: Record<string, unknown>
}

export interface TopologyCluster {
  id: string
  centroidLng: number
  centroidLat: number
  count: number
  childIds?: string[]
  elementTypes: Record<string, number>
}

export interface EndpointStub {
  id: string
  lng: number
  lat: number
}

// --- API Response Types ---

export interface TileElementsResponse {
  elements: NetworkElement[]
  clusters: TopologyCluster[]
  generation: number
  removedIds: string[]
}

export interface TileLinksResponse {
  links: TopologyLink[]
  stubs: EndpointStub[]
  generation: number
  removedLinkIds: string[]
}

export interface ElementDetailResponse extends NetworkElement {}

export interface NeighborsResponse {
  elements: NetworkElement[]
  links: TopologyLink[]
}

export interface SearchResponse {
  results: NetworkElement[]
  total: number
}

// --- Type Guards ---

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isNetworkElement(value: unknown): value is NetworkElement {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.label === 'string' &&
    typeof value.lng === 'number' &&
    typeof value.lat === 'number' &&
    typeof value.version === 'number' &&
    typeof value.updatedAt === 'string' &&
    isObject(value.properties)
  )
}

export function isTopologyLink(value: unknown): value is TopologyLink {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.sourceId === 'string' &&
    typeof value.targetId === 'string' &&
    typeof value.directed === 'boolean' &&
    typeof value.version === 'number' &&
    typeof value.updatedAt === 'string' &&
    isObject(value.properties)
  )
}

export function isTopologyCluster(value: unknown): value is TopologyCluster {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.centroidLng === 'number' &&
    typeof value.centroidLat === 'number' &&
    typeof value.count === 'number' &&
    isObject(value.elementTypes)
  )
}

// --- Filter Types ---

export interface FilterCriteria {
  types: string[]               // element types to include (empty = all)
  searchQuery: string           // current search text
  propertyFilters: Record<string, string>  // key → value filter on element properties
}
