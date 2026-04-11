// src/workers/layout-worker.ts

export interface LayoutNode {
  id: string
  x: number
  y: number
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface LayoutInput {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  iterations: number
}

export interface LayoutPosition {
  id: string
  x: number
  y: number
}

export interface LayoutOutput {
  positions: LayoutPosition[]
}

interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
}

export function computeLayout(input: LayoutInput): LayoutOutput {
  if (input.nodes.length === 0) return { positions: [] }

  const simNodes: SimNode[] = input.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    vx: 0,
    vy: 0,
  }))

  const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]))
  const simLinks = input.edges
    .filter((e) => nodeIndex.has(e.source) && nodeIndex.has(e.target))
    .map((e) => ({ source: nodeIndex.get(e.source)!, target: nodeIndex.get(e.target)! }))

  const repulsionStrength = 300
  const springLength = 80
  const springStrength = 0.06
  const centeringStrength = 0.01
  const collisionRadius = 15
  const collisionStrength = 0.2
  const damping = 0.9
  const safeIterations = Math.max(0, Math.floor(input.iterations))

  for (let step = 0; step < safeIterations; step += 1) {
    for (let i = 0; i < simNodes.length; i += 1) {
      for (let j = i + 1; j < simNodes.length; j += 1) {
        const a = simNodes[i]!
        const b = simNodes[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy)
        if (dist < 1e-6) {
          dx = 1e-3
          dy = 0
          dist = 1e-3
        }

        const nx = dx / dist
        const ny = dy / dist

        const repel = repulsionStrength / (dist * dist)
        a.vx -= nx * repel
        a.vy -= ny * repel
        b.vx += nx * repel
        b.vy += ny * repel

        if (dist < collisionRadius * 2) {
          const overlap = collisionRadius * 2 - dist
          const push = overlap * collisionStrength
          a.vx -= nx * push
          a.vy -= ny * push
          b.vx += nx * push
          b.vy += ny * push
        }
      }
    }

    for (const link of simLinks) {
      const source = simNodes[link.source]!
      const target = simNodes[link.target]!
      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.max(1e-6, Math.hypot(dx, dy))
      const nx = dx / dist
      const ny = dy / dist
      const displacement = dist - springLength
      const pull = displacement * springStrength

      source.vx += nx * pull
      source.vy += ny * pull
      target.vx -= nx * pull
      target.vy -= ny * pull
    }

    for (const node of simNodes) {
      node.vx += -node.x * centeringStrength
      node.vy += -node.y * centeringStrength

      node.vx *= damping
      node.vy *= damping
      node.x += node.vx
      node.y += node.vy
    }
  }

  const positions: LayoutPosition[] = simNodes.map((n) => ({
    id: n.id,
    x: n.x!,
    y: n.y!,
  }))

  return { positions }
}

// Web Worker message handler — only runs in worker context
if (typeof self !== 'undefined' && typeof (self as any).WorkerGlobalScope !== 'undefined') {
  self.onmessage = (event: MessageEvent<LayoutInput>) => {
    const result = computeLayout(event.data)
    self.postMessage(result)
  }
}
