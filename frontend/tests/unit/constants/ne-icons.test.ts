import { describe, expect, it } from 'vitest'
import {
  KNOWN_NE_TYPES,
  getNeIconSpec,
  toDeckColor,
} from '@/constants/ne-icons'

describe('ne icon metadata', () => {
  it('defines icon specs for all supported NE types', () => {
    expect(KNOWN_NE_TYPES).toEqual([
      'router',
      'switch',
      'server',
      'firewall',
      'access-point',
    ])

    for (const type of KNOWN_NE_TYPES) {
      const spec = getNeIconSpec(type)
      expect(spec.type).toBe(type)
      expect(spec.label).toMatch(/\S/)
      expect(spec.iconUrl).toMatch(/^data:image\/svg\+xml,/)
      expect(spec.colorHex).toMatch(/^#/)
      expect(spec.badgeRgb).toHaveLength(3)
      expect(toDeckColor(type)).toHaveLength(4)
    }
  })

  it('falls back safely for unknown types', () => {
    const spec = getNeIconSpec('unknown-type')
    expect(spec.type).toBe('unknown-type')
    expect(spec.label).toBe('Unknown')
    expect(spec.iconUrl).toBe(getNeIconSpec('router').iconUrl)
    expect(toDeckColor('unknown-type')).toEqual([96, 165, 250, 220])
  })
})
