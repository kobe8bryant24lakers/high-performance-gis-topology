// src/utils/lru-tile-cache.ts

interface TileEntry {
  key: string
  elementCount: number
}

export class LruTileCache {
  private order: TileEntry[] = []
  private index = new Map<string, TileEntry>()
  private maxTiles: number
  private maxElements: number

  constructor(maxTiles = 200, maxElements = 200_000) {
    this.maxTiles = maxTiles
    this.maxElements = maxElements
  }

  get size(): number {
    return this.index.size
  }

  get totalElements(): number {
    let total = 0
    for (const entry of this.order) {
      total += entry.elementCount
    }
    return total
  }

  has(key: string): boolean {
    return this.index.has(key)
  }

  touch(key: string, elementCount: number): string[] {
    const existing = this.index.get(key)
    if (existing) {
      const idx = this.order.indexOf(existing)
      if (idx !== -1) this.order.splice(idx, 1)
      existing.elementCount = elementCount
      this.order.push(existing)
      return this.enforce()
    }

    const entry: TileEntry = { key, elementCount }
    this.order.push(entry)
    this.index.set(key, entry)
    return this.enforce()
  }

  delete(key: string): void {
    const entry = this.index.get(key)
    if (!entry) return
    const idx = this.order.indexOf(entry)
    if (idx !== -1) this.order.splice(idx, 1)
    this.index.delete(key)
  }

  keys(): IterableIterator<string> {
    return this.index.keys()
  }

  private enforce(): string[] {
    const evicted: string[] = []

    while (this.order.length > this.maxTiles) {
      const oldest = this.order.shift()!
      this.index.delete(oldest.key)
      evicted.push(oldest.key)
    }

    while (this.order.length > 0 && this.totalElements > this.maxElements) {
      const oldest = this.order.shift()!
      this.index.delete(oldest.key)
      evicted.push(oldest.key)
    }

    return evicted
  }
}
