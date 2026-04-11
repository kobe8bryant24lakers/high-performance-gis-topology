// tests/unit/workers/layout-worker.test.ts
import { describe, it, expect } from 'vitest'
import { computeLayout, type LayoutInput, type LayoutOutput } from '@/workers/layout-worker'

describe('computeLayout', () => {
  it('returns positions for all nodes', () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
        { id: 'c', x: 0, y: 100 },
      ],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
      iterations: 50,
    }

    const output = computeLayout(input)
    expect(output.positions).toHaveLength(3)
    expect(output.positions.map((p) => p.id).sort()).toEqual(['a', 'b', 'c'])
    for (const pos of output.positions) {
      expect(typeof pos.x).toBe('number')
      expect(typeof pos.y).toBe('number')
      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    }
  })

  it('connected nodes are closer than unconnected', () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 500, y: 500 },
        { id: 'c', x: -500, y: -500 },
      ],
      edges: [{ source: 'a', target: 'b' }],
      iterations: 300,
    }

    const output = computeLayout(input)
    const pos = Object.fromEntries(output.positions.map((p) => [p.id, p]))
    const distAB = Math.hypot(pos.a!.x - pos.b!.x, pos.a!.y - pos.b!.y)
    const distAC = Math.hypot(pos.a!.x - pos.c!.x, pos.a!.y - pos.c!.y)
    expect(distAB).toBeLessThan(distAC)
  })

  it('handles empty input', () => {
    const output = computeLayout({ nodes: [], edges: [], iterations: 10 })
    expect(output.positions).toEqual([])
  })

  it('handles nodes with no edges', () => {
    const input: LayoutInput = {
      nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 100 }],
      edges: [],
      iterations: 50,
    }
    const output = computeLayout(input)
    expect(output.positions).toHaveLength(2)
  })
})
