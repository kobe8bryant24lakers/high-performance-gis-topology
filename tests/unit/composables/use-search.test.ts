// tests/unit/composables/use-search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { performSearch, useSearchStore } from '@/composables/use-search'
import type { SearchResponse } from '@/types/topology'

// Mock apiGet
vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
}))

import { apiGet } from '@/api/client'
const mockApiGet = vi.mocked(apiGet)

describe('performSearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('calls API with query and limit', async () => {
    const mockResponse: SearchResponse = {
      results: [{ id: '1', type: 'router', label: 'router-1', lng: 0, lat: 0, version: 1, updatedAt: '', properties: {} }],
      total: 1,
    }
    mockApiGet.mockResolvedValue(mockResponse)

    const result = await performSearch('router', 20)
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/topology/search?q=router&limit=20',
      expect.any(Object),
    )
    expect(result.results).toHaveLength(1)
  })

  it('returns empty results for empty query', async () => {
    const result = await performSearch('', 20)
    expect(mockApiGet).not.toHaveBeenCalled()
    expect(result.results).toEqual([])
    expect(result.total).toBe(0)
  })
})

describe('useSearchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('keeps loading true while a newer search is still running', async () => {
    const store = useSearchStore()
    const first = deferred<SearchResponse>()
    const second = deferred<SearchResponse>()

    mockApiGet
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const firstSearch = store.search('router')
    expect(store.isSearching).toBe(true)

    const secondSearch = store.search('switch')
    expect(store.isSearching).toBe(true)

    first.reject(new DOMException('aborted', 'AbortError'))
    await firstSearch
    expect(store.isSearching).toBe(true)

    second.resolve({
      results: [{ id: '2', type: 'switch', label: 'switch-1', lng: 0, lat: 0, version: 1, updatedAt: '', properties: {} }],
      total: 1,
    })
    await secondSearch

    expect(store.isSearching).toBe(false)
    expect(store.results).toHaveLength(1)
    expect(store.results[0].id).toBe('2')
  })
})
