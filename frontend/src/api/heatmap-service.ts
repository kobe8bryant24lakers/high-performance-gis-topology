import { apiGet } from './client'
import type { DeviceHeatmapResponse } from '@/types/topology'
import type { ViewportBounds } from '@/stores/viewport'

export interface DeviceHeatmapQuery {
  bounds: ViewportBounds
  columns: number
  rows: number
  types: readonly string[]
  propertyFilters: Readonly<Record<string, string>>
}

function normalizeTypeToken(token: string): string {
  return encodeURIComponent(token.trim().toLowerCase())
}

export function buildDeviceHeatmapQuery(query: DeviceHeatmapQuery): string {
  const params = [
    `west=${query.bounds.west}`,
    `south=${query.bounds.south}`,
    `east=${query.bounds.east}`,
    `north=${query.bounds.north}`,
    `cols=${Math.floor(query.columns)}`,
    `rows=${Math.floor(query.rows)}`,
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

export class HeatmapService {
  private generation = 0
  private controller: AbortController | null = null

  nextGeneration(): number {
    this.generation++
    return this.generation
  }

  currentGeneration(): number {
    return this.generation
  }

  async fetchDeviceHeatmap(
    query: DeviceHeatmapQuery,
    requestGeneration: number = this.currentGeneration(),
  ): Promise<DeviceHeatmapResponse | null> {
    this.controller?.abort()
    this.controller = new AbortController()

    try {
      const result = await apiGet<DeviceHeatmapResponse>(
        `/api/topology/heatmap${buildDeviceHeatmapQuery(query)}`,
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
