import type { NetworkElement, TopologyLink, TopologyCluster } from '@/types/topology'

const ELEMENT_TYPES = ['router', 'switch', 'server', 'firewall', 'access-point']
const CALIFORNIA_BOUNDS = {
  west: -124.482003,
  east: -114.131211,
  south: 32.528832,
  north: 42.009518,
}

let seed = 42
function seededRandom(): number {
  seed = (seed * 16807 + 0) % 2147483647
  return (seed - 1) / 2147483646
}

export function resetSeed(s = 42): void {
  seed = s
}

export function generateElements(count: number): NetworkElement[] {
  const elements: NetworkElement[] = []
  for (let i = 0; i < count; i++) {
    const lng = CALIFORNIA_BOUNDS.west + seededRandom() * (CALIFORNIA_BOUNDS.east - CALIFORNIA_BOUNDS.west)
    const lat = CALIFORNIA_BOUNDS.south + seededRandom() * (CALIFORNIA_BOUNDS.north - CALIFORNIA_BOUNDS.south)
    const typeIndex = Math.floor(seededRandom() * ELEMENT_TYPES.length)
    const elementType = ELEMENT_TYPES[typeIndex] ?? 'router'
    elements.push({
      id: `el-${i}`,
      type: elementType,
      label: `${elementType}-${i}`,
      lng,
      lat,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: { index: i },
    })
  }
  return elements
}

export function generateLinks(elements: NetworkElement[], count: number): TopologyLink[] {
  const links: TopologyLink[] = []
  for (let i = 0; i < count; i++) {
    const srcIdx = Math.floor(seededRandom() * elements.length)
    let tgtIdx = Math.floor(seededRandom() * elements.length)
    if (tgtIdx === srcIdx) tgtIdx = (tgtIdx + 1) % elements.length
    const src = elements[srcIdx]!
    const tgt = elements[tgtIdx]!
    links.push({
      id: `link-${i}`,
      type: 'connection',
      sourceId: src.id,
      targetId: tgt.id,
      directed: false,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: {},
    })
  }
  return links
}

export function tileToBBox(z: number, x: number, y: number): { west: number; south: number; east: number; north: number } {
  const n = Math.pow(2, z)
  const west = (x / n) * 360 - 180
  const east = ((x + 1) / n) * 360 - 180
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)))
  const north = (northRad * 180) / Math.PI
  const south = (southRad * 180) / Math.PI
  return { west, south, east, north }
}

export function elementsInTile(elements: NetworkElement[], z: number, x: number, y: number): NetworkElement[] {
  const { west, south, east, north } = tileToBBox(z, x, y)
  return elements.filter(
    (el) => el.lng >= west && el.lng <= east && el.lat >= south && el.lat <= north,
  )
}

export function generateClustersForTile(
  elements: NetworkElement[],
  z: number,
  x: number,
  y: number,
): TopologyCluster[] {
  if (elements.length === 0) return []

  const { west, south, east, north } = tileToBBox(z, x, y)
  const midLng = (west + east) / 2
  const midLat = (south + north) / 2

  const quadrants: NetworkElement[][] = [[], [], [], []]
  for (const el of elements) {
    const qi = (el.lng >= midLng ? 1 : 0) + (el.lat >= midLat ? 2 : 0)
    quadrants[qi]!.push(el)
  }

  const clusters: TopologyCluster[] = []
  const lngs = [(west + midLng) / 2, (midLng + east) / 2, (west + midLng) / 2, (midLng + east) / 2]
  const lats = [(south + midLat) / 2, (south + midLat) / 2, (midLat + north) / 2, (midLat + north) / 2]

  for (let qi = 0; qi < 4; qi++) {
    const group = quadrants[qi]!
    if (group.length === 0) continue
    const types: Record<string, number> = {}
    for (const el of group) {
      types[el.type] = (types[el.type] ?? 0) + 1
    }
    clusters.push({
      id: `cluster-${z}-${x}-${y}-q${qi}`,
      centroidLng: lngs[qi]!,
      centroidLat: lats[qi]!,
      count: group.length,
      childIds: group.map((el) => el.id),
      elementTypes: types,
    })
  }
  return clusters
}
