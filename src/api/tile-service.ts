import { apiGet } from './client'
import type { TileElementsResponse, TileLinksResponse, NeighborsResponse } from '@/types/topology'

export class TileService {
  private generation = 0
  private controllers = new Map<string, AbortController>()

  nextGeneration(): number {
    this.generation++
    return this.generation
  }

  currentGeneration(): number {
    return this.generation
  }

  private tileKey(z: number, x: number, y: number, suffix: string): string {
    return `${z}/${x}/${y}/${suffix}`
  }

  async fetchTileElements(
    z: number, x: number, y: number,
    requestGeneration: number,
    queryString: string = '',
  ): Promise<TileElementsResponse | null> {
    const key = this.tileKey(z, x, y, 'elements')
    this.controllers.get(key)?.abort()

    const controller = new AbortController()
    this.controllers.set(key, controller)

    try {
      const result = await apiGet<TileElementsResponse>(
        `/api/topology/tiles/${z}/${x}/${y}/elements${queryString}`,
        { signal: controller.signal, maxRetries: 3, baseDelayMs: 0 },
      )
      if (requestGeneration < this.generation) return null
      return result
    } finally {
      this.controllers.delete(key)
    }
  }

  async fetchTileLinks(
    z: number, x: number, y: number,
    requestGeneration: number,
    queryString: string = '',
  ): Promise<TileLinksResponse | null> {
    const key = this.tileKey(z, x, y, 'links')
    this.controllers.get(key)?.abort()

    const controller = new AbortController()
    this.controllers.set(key, controller)

    try {
      const result = await apiGet<TileLinksResponse>(
        `/api/topology/tiles/${z}/${x}/${y}/links${queryString}`,
        { signal: controller.signal, maxRetries: 3, baseDelayMs: 0 },
      )
      if (requestGeneration < this.generation) return null
      return result
    } finally {
      this.controllers.delete(key)
    }
  }

  async fetchNeighbors(
    elementId: string,
    depth: number = 1,
    signal?: AbortSignal,
  ): Promise<NeighborsResponse> {
    const key = `neighbors/${elementId}`
    this.controllers.get(key)?.abort()

    const controller = new AbortController()
    this.controllers.set(key, controller)

    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal

    try {
      return await apiGet<NeighborsResponse>(
        `/api/topology/elements/${encodeURIComponent(elementId)}/neighbors?depth=${depth}`,
        { signal: combinedSignal, maxRetries: 2, baseDelayMs: 500 },
      )
    } finally {
      this.controllers.delete(key)
    }
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) {
      controller.abort()
    }
    this.controllers.clear()
  }
}
