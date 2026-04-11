// tests/unit/utils/lru-tile-cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { LruTileCache } from '@/utils/lru-tile-cache'

describe('LruTileCache', () => {
  let cache: LruTileCache

  beforeEach(() => {
    cache = new LruTileCache(3)
  })

  it('tracks tiles and reports has()', () => {
    cache.touch('2/1/1', 10)
    expect(cache.has('2/1/1')).toBe(true)
    expect(cache.has('2/1/2')).toBe(false)
  })

  it('evicts LRU tile when capacity is exceeded', () => {
    cache.touch('a', 5)
    cache.touch('b', 5)
    cache.touch('c', 5)
    const evicted = cache.touch('d', 5)
    expect(evicted).toEqual(['a'])
    expect(cache.has('a')).toBe(false)
    expect(cache.has('d')).toBe(true)
  })

  it('touch() promotes existing tile to most recent', () => {
    cache.touch('a', 5)
    cache.touch('b', 5)
    cache.touch('c', 5)
    cache.touch('a', 5)
    const evicted = cache.touch('d', 5)
    expect(evicted).toEqual(['b'])
  })

  it('delete() removes a tile', () => {
    cache.touch('a', 5)
    cache.delete('a')
    expect(cache.has('a')).toBe(false)
    expect(cache.size).toBe(0)
  })

  it('tracks total element count', () => {
    cache.touch('a', 100)
    cache.touch('b', 200)
    expect(cache.totalElements).toBe(300)
    cache.delete('a')
    expect(cache.totalElements).toBe(200)
  })

  it('evicts multiple tiles to stay under element budget', () => {
    const bigCache = new LruTileCache(100, 200)
    bigCache.touch('a', 100)
    bigCache.touch('b', 100)
    // Total = 200, at budget. Adding 'c' pushes to 300, must evict 'a' to get to 200.
    const evictedC = bigCache.touch('c', 100)
    expect(evictedC).toEqual(['a'])
    // Adding 'd' pushes to 300 again, must evict 'b'.
    const evictedD = bigCache.touch('d', 100)
    expect(evictedD).toEqual(['b'])
    expect(bigCache.totalElements).toBeLessThanOrEqual(200)
    expect(bigCache.size).toBe(2)
  })

  it('keys() returns all tile keys', () => {
    cache.touch('a', 5)
    cache.touch('b', 5)
    expect([...cache.keys()]).toEqual(['a', 'b'])
  })
})
