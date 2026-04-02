import type { NetworkElement, TopologyLink } from '@/types/topology'

const ELEMENT_TYPES = ['router', 'switch', 'server', 'firewall', 'access-point']

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
    const lng = seededRandom() * 360 - 180
    const lat = seededRandom() * 180 - 90
    const typeIndex = Math.floor(seededRandom() * ELEMENT_TYPES.length)
    elements.push({
      id: `el-${i}`,
      type: ELEMENT_TYPES[typeIndex],
      label: `${ELEMENT_TYPES[typeIndex]}-${i}`,
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
    links.push({
      id: `link-${i}`,
      type: 'connection',
      sourceId: elements[srcIdx].id,
      targetId: elements[tgtIdx].id,
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
