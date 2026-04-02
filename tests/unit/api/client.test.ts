import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiGet } from '@/api/client'

describe('apiGet', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: 'ok' }), { status: 200 }),
    )
    const result = await apiGet<{ data: string }>('/test')
    expect(result).toEqual({ data: 'ok' })
  })

  it('throws on 4xx without retrying', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404 }),
    )
    await expect(apiGet('/not-found')).rejects.toThrow('HTTP 404')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries on 5xx up to maxRetries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const result = await apiGet<{ ok: boolean }>('/retry-test', { maxRetries: 3, baseDelayMs: 0 })
    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('aborts when signal is triggered', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(apiGet('/abort-test', { signal: controller.signal })).rejects.toThrow()
  })
})
