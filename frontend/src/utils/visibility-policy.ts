import type { NetworkElement } from '@/types/topology'

export type FirewallNetworkTier = 'core' | 'aggregation' | 'access'

export function allowedTypesForZoom(zoom: number): string[] {
  const z = Math.floor(zoom)
  if (z <= 11) return ['firewall']
  if (z <= 13) return ['firewall', 'router', 'switch']
  if (z <= 15) return ['firewall', 'router', 'switch', 'server']
  return ['firewall', 'router', 'switch', 'server', 'access-point']
}

export function allowedNetworkTiersForZoom(zoom: number): FirewallNetworkTier[] {
  const z = Math.floor(zoom)
  if (z <= 7) return ['core']
  if (z <= 10) return ['aggregation', 'core']
  return []
}

export function firewallTierForOrdinal(firewallOrdinal: number): FirewallNetworkTier {
  if (firewallOrdinal % 1000 === 0) return 'core'
  if (firewallOrdinal % 10 < 2) return 'aggregation'
  return 'access'
}

export function elementMatchesZoomPolicy(
  element: Pick<NetworkElement, 'type' | 'properties'>,
  zoom: number,
  effectiveTypes: ReadonlySet<string> = new Set(allowedTypesForZoom(zoom)),
): boolean {
  if (!effectiveTypes.has(element.type)) return false
  const allowedTiers = allowedNetworkTiersForZoom(zoom)
  if (allowedTiers.length === 0) return true
  return element.type === 'firewall'
    && allowedTiers.includes(element.properties.networkTier as FirewallNetworkTier)
}
