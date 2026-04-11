// tests/unit/utils/telemetry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telemetry } from '@/utils/telemetry'

describe('Telemetry', () => {
  let telemetry: Telemetry

  beforeEach(() => {
    telemetry = new Telemetry()
  })

  it('emits events to registered listeners', () => {
    const listener = vi.fn()
    telemetry.on('tile_fetch_ms', listener)
    telemetry.emit('tile_fetch_ms', 150)
    expect(listener).toHaveBeenCalledWith(150)
  })

  it('removes listeners with off()', () => {
    const listener = vi.fn()
    telemetry.on('tile_fetch_ms', listener)
    telemetry.off('tile_fetch_ms', listener)
    telemetry.emit('tile_fetch_ms', 150)
    expect(listener).not.toHaveBeenCalled()
  })

  it('tracks rolling averages', () => {
    telemetry.emit('fps', 60)
    telemetry.emit('fps', 50)
    telemetry.emit('fps', 40)
    expect(telemetry.getAverage('fps')).toBeCloseTo(50)
  })

  it('caps rolling window at maxSamples', () => {
    const t = new Telemetry(3)
    t.emit('fps', 100)
    t.emit('fps', 10)
    t.emit('fps', 10)
    t.emit('fps', 10)
    expect(t.getAverage('fps')).toBeCloseTo(10)
  })

  it('getAverage returns 0 for unknown metrics', () => {
    expect(telemetry.getAverage('unknown_metric')).toBe(0)
  })
})
