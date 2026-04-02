import { describe, it, expect } from 'vitest'
import {
  isNetworkElement,
  isTopologyLink,
  isTopologyCluster,
  type NetworkElement,
  type TopologyLink,
  type TopologyCluster,
} from '@/types/topology'

describe('isNetworkElement', () => {
  it('returns true for a valid NetworkElement', () => {
    const el: NetworkElement = {
      id: 'node-1',
      type: 'router',
      label: 'Router A',
      lng: 116.4,
      lat: 39.9,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: { vendor: 'Cisco' },
    }
    expect(isNetworkElement(el)).toBe(true)
  })

  it('returns false when id is missing', () => {
    expect(isNetworkElement({ type: 'router', label: 'X', lng: 0, lat: 0, version: 1, updatedAt: '', properties: {} })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isNetworkElement(null)).toBe(false)
  })
})

describe('isTopologyLink', () => {
  it('returns true for a valid TopologyLink', () => {
    const link: TopologyLink = {
      id: 'link-1',
      type: 'fiber',
      sourceId: 'node-1',
      targetId: 'node-2',
      directed: false,
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      properties: {},
    }
    expect(isTopologyLink(link)).toBe(true)
  })

  it('returns false when sourceId is missing', () => {
    expect(isTopologyLink({ id: 'link-1', type: 'fiber', targetId: 'n2', directed: false, version: 1, updatedAt: '', properties: {} })).toBe(false)
  })
})

describe('isTopologyCluster', () => {
  it('returns true for a valid TopologyCluster', () => {
    const cluster: TopologyCluster = {
      id: 'cluster-1',
      centroidLng: 116.4,
      centroidLat: 39.9,
      count: 42,
      elementTypes: { router: 20, switch: 22 },
    }
    expect(isTopologyCluster(cluster)).toBe(true)
  })

  it('returns false when count is missing', () => {
    expect(isTopologyCluster({ id: 'c1', centroidLng: 0, centroidLat: 0, elementTypes: {} })).toBe(false)
  })
})
