import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TileService } from '@/api/tile-service'
import type { TileElementsResponse } from '@/types/topology'

describe('TileService', () => {
  let service: TileService

  beforeEach(() => {
    service = new TileService()
    vi.restoreAllMocks()
  })

  it('fetches tile elements and returns them', async () => {
    const mockResponse: TileElementsResponse = {
      elements: [{ id: 'el-1', type: 'router', label: 'R1', lng: 10, lat: 20, version: 1, updatedAt: '', properties: {} }],
      clusters: [],
      generation: 1,
      removedIds: [],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const gen = service.nextGeneration()
    const result = await service.fetchTileElements(2, 1, 1, gen)
    expect(result).not.toBeNull()
    expect(result!.elements).toHaveLength(1)
  })

  it('discards responses from stale generations', async () => {
    const mockResponse: TileElementsResponse = {
      elements: [{ id: 'el-1', type: 'router', label: 'R1', lng: 10, lat: 20, version: 1, updatedAt: '', properties: {} }],
      clusters: [],
      generation: 1,
      removedIds: [],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const staleGen = service.nextGeneration()
    service.nextGeneration()
    const result = await service.fetchTileElements(2, 1, 1, staleGen)
    expect(result).toBeNull()
  })

  it('cancels in-flight requests on cancelAll', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal
          if (signal) {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          }
        }),
    )

    const gen = service.nextGeneration()
    const promise = service.fetchTileElements(2, 1, 1, gen)
    service.cancelAll()
    await expect(promise).rejects.toThrow()
  })
})
