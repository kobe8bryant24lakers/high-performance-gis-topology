import { apiGet } from './client'
import type { RegionSummaryResponse } from '@/types/topology'
import type { ViewportBounds } from '@/stores/viewport'

export interface RegionSummaryQuery {
  z: number
  bounds: ViewportBounds
  types: readonly string[]
  propertyFilters: Readonly<Record<string, string>>
}

function normalizeTypeToken(token: string): string {
  return encodeURIComponent(token.trim().toLowerCase())
}

export function buildRegionSummaryQuery(query: RegionSummaryQuery): string {
  const params = [
    `z=${Math.floor(query.z)}`,
    `west=${query.bounds.west}`,
    `south=${query.bounds.south}`,
    `east=${query.bounds.east}`,
    `north=${query.bounds.north}`,
  ]

  const normalizedTypes = query.types
    .map(normalizeTypeToken)
    .filter((token) => token.length > 0)
  if (normalizedTypes.length > 0) {
    params.push(`types=${normalizedTypes.join(',')}`)
  }

  for (const [key, value] of Object.entries(query.propertyFilters)) {
    params.push(`prop.${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }

  return `?${params.join('&')}`
}

export class RegionService {
  private generation = 0
  private controller: AbortController | null = null

  nextGeneration(): number {
    this.generation++
    return this.generation
  }

  currentGeneration(): number {
    return this.generation
  }

  async fetchRegionSummary(
    query: RegionSummaryQuery,
    requestGeneration: number = this.currentGeneration(),
  ): Promise<RegionSummaryResponse | null> {
    this.controller?.abort()
    this.controller = new AbortController()

    try {
      const result = await apiGet<RegionSummaryResponse>(
        `/api/topology/regions/summary${buildRegionSummaryQuery(query)}`,
        { signal: this.controller.signal, maxRetries: 3, baseDelayMs: 0 },
      )
      if (requestGeneration < this.generation) return null
      return result
    } finally {
      this.controller = null
    }
  }

  cancel(): void {
    this.controller?.abort()
    this.controller = null
  }
}
