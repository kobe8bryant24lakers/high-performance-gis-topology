import routerIcon from '@/assets/ne-icons/router.svg'
import switchIcon from '@/assets/ne-icons/switch.svg'
import serverIcon from '@/assets/ne-icons/server.svg'
import firewallIcon from '@/assets/ne-icons/firewall.svg'
import accessPointIcon from '@/assets/ne-icons/access-point.svg'

export const KNOWN_NE_TYPES = [
  'router',
  'switch',
  'server',
  'firewall',
  'access-point',
] as const

export type KnownNeType = typeof KNOWN_NE_TYPES[number]

export interface NeIconSpec {
  type: string
  label: string
  shortLabel: string
  iconUrl: string
  colorHex: string
  badgeRgb: [number, number, number]
}

const ICON_SPECS: Record<KnownNeType, NeIconSpec> = {
  router: {
    type: 'router',
    label: 'Router',
    shortLabel: 'RT',
    iconUrl: routerIcon,
    colorHex: '#4DA3FF',
    badgeRgb: [77, 163, 255],
  },
  switch: {
    type: 'switch',
    label: 'Switch',
    shortLabel: 'SW',
    iconUrl: switchIcon,
    colorHex: '#23B7A4',
    badgeRgb: [35, 183, 164],
  },
  server: {
    type: 'server',
    label: 'Server',
    shortLabel: 'SV',
    iconUrl: serverIcon,
    colorHex: '#7A8A9D',
    badgeRgb: [122, 138, 157],
  },
  firewall: {
    type: 'firewall',
    label: 'Firewall',
    shortLabel: 'FW',
    iconUrl: firewallIcon,
    colorHex: '#F97352',
    badgeRgb: [249, 115, 82],
  },
  'access-point': {
    type: 'access-point',
    label: 'Access Point',
    shortLabel: 'AP',
    iconUrl: accessPointIcon,
    colorHex: '#E6A93D',
    badgeRgb: [230, 169, 61],
  },
}

const FALLBACK_SPEC: NeIconSpec = {
  type: 'unknown',
  label: 'Unknown',
  shortLabel: 'UN',
  iconUrl: routerIcon,
  colorHex: '#60A5FA',
  badgeRgb: [96, 165, 250],
}

export function getNeIconSpec(type: string): NeIconSpec {
  return ICON_SPECS[type as KnownNeType] ?? { ...FALLBACK_SPEC, type }
}

export function toDeckColor(type: string, alpha = 220): [number, number, number, number] {
  const [r, g, b] = getNeIconSpec(type).badgeRgb
  return [r, g, b, alpha]
}
