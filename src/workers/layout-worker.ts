// src/workers/layout-worker.ts
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum } from 'd3-force'

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

interface SimNode extends SimulationNodeDatum {
  id: string
}

export function computeLayout(input: LayoutInput): LayoutOutput {
  if (input.nodes.length === 0) return { positions: [] }

  const simNodes: SimNode[] = input.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
  }))

  const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]))
  const simLinks = input.edges
    .filter((e) => nodeIndex.has(e.source) && nodeIndex.has(e.target))
    .map((e) => ({ source: nodeIndex.get(e.source)!, target: nodeIndex.get(e.target)! }))

  const simulation = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).distance(80).strength(0.5))
    .force('charge', forceManyBody().strength(-120))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(15))
    .stop()

  simulation.tick(input.iterations)

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
