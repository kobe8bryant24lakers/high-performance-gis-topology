import { describe, it, expect, beforeEach } from 'vitest'
import { generateElements, elementsInTile, generateClustersForTile, resetSeed } from '@/mock/data-generator'

describe('generateClustersForTile', () => {
  beforeEach(() => resetSeed(42))

  it('returns empty array for no elements', () => {
    const clusters = generateClustersForTile([], 5, 0, 0)
    expect(clusters).toEqual([])
  })

  it('generates clusters with correct structure', () => {
    const elements = generateElements(500)
    const tileElements = elementsInTile(elements, 3, 4, 3)
    if (tileElements.length === 0) return

    const clusters = generateClustersForTile(tileElements, 3, 4, 3)
    for (const cluster of clusters) {
      expect(cluster.id).toMatch(/^cluster-3-4-3-q\d$/)
      expect(cluster.count).toBeGreaterThan(0)
      expect(typeof cluster.centroidLng).toBe('number')
      expect(typeof cluster.centroidLat).toBe('number')
      expect(cluster.childIds).toBeDefined()
      expect(cluster.childIds!.length).toBe(cluster.count)
      expect(Object.values(cluster.elementTypes).reduce((a, b) => a + b, 0)).toBe(cluster.count)
    }
  })

  it('cluster child counts sum to total elements', () => {
    const elements = generateElements(500)
    const tileElements = elementsInTile(elements, 3, 4, 3)
    if (tileElements.length === 0) return

    const clusters = generateClustersForTile(tileElements, 3, 4, 3)
    const totalCount = clusters.reduce((sum, c) => sum + c.count, 0)
    expect(totalCount).toBe(tileElements.length)
  })
})
