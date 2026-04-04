// src/utils/telemetry.ts

type TelemetryListener = (value: number) => void

export class Telemetry {
  private listeners = new Map<string, Set<TelemetryListener>>()
  private samples = new Map<string, number[]>()
  private maxSamples: number

  constructor(maxSamples = 60) {
    this.maxSamples = maxSamples
  }

  on(event: string, listener: TelemetryListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off(event: string, listener: TelemetryListener): void {
    this.listeners.get(event)?.delete(listener)
  }

  emit(event: string, value: number): void {
    if (!this.samples.has(event)) {
      this.samples.set(event, [])
    }
    const arr = this.samples.get(event)!
    arr.push(value)
    if (arr.length > this.maxSamples) {
      arr.shift()
    }

    const set = this.listeners.get(event)
    if (set) {
      for (const fn of set) {
        fn(value)
      }
    }
  }

  getAverage(event: string): number {
    const arr = this.samples.get(event)
    if (!arr || arr.length === 0) return 0
    return arr.reduce((sum, v) => sum + v, 0) / arr.length
  }

  getLatest(event: string): number | undefined {
    const arr = this.samples.get(event)
    if (!arr || arr.length === 0) return undefined
    return arr[arr.length - 1]
  }

  clear(): void {
    this.samples.clear()
  }
}

/** Singleton telemetry instance used across the app */
export const telemetry = new Telemetry()
