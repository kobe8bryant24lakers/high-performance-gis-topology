import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers } from '@/mock/handlers'
import { TileService } from '@/api/tile-service'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterAll(() => server.close())

describe('TileService.fetchNeighbors', () => {
  it('fetches neighbors for a valid element', async () => {
    const service = new TileService()
    const result = await service.fetchNeighbors('el-0')
    expect(result).toBeDefined()
    expect(result!.elements).toBeInstanceOf(Array)
    expect(result!.links).toBeInstanceOf(Array)
  })

  it('returns null for non-existent element', async () => {
    const service = new TileService()
    await expect(service.fetchNeighbors('nonexistent-id')).rejects.toThrow()
  })

  it('respects depth parameter', async () => {
    const service = new TileService()
    const depth1 = await service.fetchNeighbors('el-0', 1)
    const depth2 = await service.fetchNeighbors('el-0', 2)
    expect(depth2!.elements.length).toBeGreaterThanOrEqual(depth1!.elements.length)
  })
})
