# NE Icon SVG System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the schematic view's letter-based NE markers with a consistent SVG icon system, add shared type metadata for colors and labels, and surface the new icons in filter, toolbar, and detail/search UI.

**Architecture:** Add one shared frontend metadata module for NE types, colors, labels, and SVG asset URLs, then consume it from both Deck.GL and Vue UI components. Render the schematic icons through a Deck.GL `IconLayer` so the topology canvas uses the same production SVG assets as the surrounding interface, while keeping the existing line layer and selection behavior intact.

**Tech Stack:** Vue 3, Vite asset imports, TypeScript, Deck.GL layers, Vitest, Vue Test Utils

---

### Task 1: Add the SVG asset set and shared NE metadata

**Files:**
- Create: `frontend/src/assets/ne-icons/router.svg`
- Create: `frontend/src/assets/ne-icons/switch.svg`
- Create: `frontend/src/assets/ne-icons/server.svg`
- Create: `frontend/src/assets/ne-icons/firewall.svg`
- Create: `frontend/src/assets/ne-icons/access-point.svg`
- Create: `frontend/src/constants/ne-icons.ts`
- Test: `frontend/tests/unit/constants/ne-icons.test.ts`

- [ ] **Step 1: Write the failing metadata test**

```ts
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
      expect(spec.iconUrl).toMatch(/\.svg$/)
      expect(spec.colorHex).toMatch(/^#/)
      expect(spec.badgeRgb).toHaveLength(3)
      expect(toDeckColor(type)).toHaveLength(4)
    }
  })

  it('falls back safely for unknown types', () => {
    const spec = getNeIconSpec('unknown-type')
    expect(spec.type).toBe('unknown-type')
    expect(spec.label).toBe('Unknown')
    expect(spec.iconUrl).toMatch(/router\.svg$/)
    expect(toDeckColor('unknown-type')).toEqual([96, 165, 250, 220])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:unit -- tests/unit/constants/ne-icons.test.ts`
Expected: FAIL with `Cannot find module '@/constants/ne-icons'` or missing export errors.

- [ ] **Step 3: Add the production SVG assets**

Use the approved design direction from [2026-04-22-ne-icons-design.md](/Users/zhangyinbing/Idea_Workspace/high-performance-gis-topology/docs/superpowers/specs/2026-04-22-ne-icons-design.md) and author five clean SVGs with a shared 64x64 viewBox. The files should follow this shape:

```svg
<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="router-body" x1="12" y1="18" x2="52" y2="48" gradientUnits="userSpaceOnUse">
      <stop stop-color="#5AA7FF"/>
      <stop offset="1" stop-color="#23486E"/>
    </linearGradient>
  </defs>
  <path d="M14 23.5L19.5 18H47.5L52 22.5V42L47.5 46H16.5L12 41.5V26L14 23.5Z" fill="url(#router-body)"/>
  <path d="M19 20H46.5C48.4 20 50 21.6 50 23.5V40.5C50 42.4 48.4 44 46.5 44H17.5C15.6 44 14 42.4 14 40.5V25C14 22.2 16.2 20 19 20Z" fill="#0F1723" fill-opacity="0.92" stroke="#B8D8FF" stroke-width="1.5"/>
  <rect x="20" y="27" width="10" height="4" rx="1.5" fill="#5AA7FF"/>
  <rect x="32" y="27" width="12" height="4" rx="1.5" fill="#7CC3FF"/>
  <rect x="20" y="35" width="24" height="3" rx="1.5" fill="#314C68"/>
  <circle cx="47.5" cy="36.5" r="2" fill="#9FF0C2"/>
</svg>
```

- [ ] **Step 4: Add the shared metadata module**

Create `frontend/src/constants/ne-icons.ts`:

```ts
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
```

- [ ] **Step 5: Run the metadata test to verify it passes**

Run: `cd frontend && npm run test:unit -- tests/unit/constants/ne-icons.test.ts`
Expected: PASS with 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/assets/ne-icons frontend/src/constants/ne-icons.ts frontend/tests/unit/constants/ne-icons.test.ts
git commit -m "feat: add NE icon assets and metadata"
```

### Task 2: Swap schematic node rendering from circles/text to SVG icons

**Files:**
- Modify: `frontend/src/composables/use-deck-layers.ts`
- Test: `frontend/tests/unit/composables/use-deck-layers.test.ts`

- [ ] **Step 1: Write the failing Deck.GL layer test**

Create `frontend/tests/unit/composables/use-deck-layers.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTopologyStore } from '@/stores/topology'
import { useDeckLayers } from '@/composables/use-deck-layers'

describe('useDeckLayers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('builds an IconLayer for NE nodes and keeps the line layer', () => {
    const topologyStore = useTopologyStore()
    topologyStore.mergeTileElements('z0/x0/y0', {
      elements: [
        {
          id: 'el-1',
          type: 'router',
          label: 'router-1',
          lng: 0,
          lat: 0,
          version: 1,
          updatedAt: '2026-01-01T00:00:00Z',
          properties: {},
        },
      ],
      clusters: [],
      generation: 1,
      removedIds: [],
    })

    const { layers } = useDeckLayers(() => undefined, () => undefined)
    const layerIds = layers.value.map((layer) => layer.id)

    expect(layerIds).toContain('links')
    expect(layerIds).toContain('node-icons')
    expect(layerIds).not.toContain('nodes')
    expect(layerIds).not.toContain('node-labels')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:unit -- tests/unit/composables/use-deck-layers.test.ts`
Expected: FAIL because the current layer list still contains `nodes` and `node-labels`.

- [ ] **Step 3: Replace the node circle/text layers with an icon layer**

Update `frontend/src/composables/use-deck-layers.ts`:

```ts
import { computed, shallowRef, watch } from 'vue'
import { IconLayer, LineLayer, ScatterplotLayer } from '@deck.gl/layers'
import { getNeIconSpec } from '@/constants/ne-icons'

// ...

allLayers.push(
  new IconLayer<NodeWithStub>({
    id: 'node-icons',
    data: nodes,
    getPosition: (d) => getNodePosition(d),
    getIcon: (d) => {
      if (d.isStub) {
        return {
          url: getNeIconSpec('router').iconUrl,
          width: 64,
          height: 64,
          anchorY: 32,
        }
      }
      return {
        url: getNeIconSpec(d.type).iconUrl,
        width: 64,
        height: 64,
        anchorY: 32,
      }
    },
    getColor: (d) => (d.isStub ? [160, 160, 160, 110] : [255, 255, 255, 255]),
    getSize: (d) => (d.isStub ? 12 : 18),
    sizeUnits: 'pixels',
    alphaCutoff: 0.05,
    pickable: pickEnabled,
    onClick: pickEnabled
      ? (info) => {
          if (info.object) onElementClick(info.object.id, info.srcEvent as PointerEvent | undefined)
        }
      : undefined,
    onHover: hoverEnabled
      ? (info) => onElementHover(info.object?.id ?? null)
      : undefined,
    updateTriggers: {
      getPosition: [viewModeStore.mode, layoutPositions?.()],
      getIcon: [nodes],
      getColor: [selectionStore.selectedIds],
    },
  }),
)
```

Keep the existing selection halo layer. Remove the `TYPE_COLORS`, `DEFAULT_COLOR`, and `TYPE_LABELS` constants from this file so metadata comes from `@/constants/ne-icons` instead of diverging.

- [ ] **Step 4: Run the Deck.GL layer test to verify it passes**

Run: `cd frontend && npm run test:unit -- tests/unit/composables/use-deck-layers.test.ts`
Expected: PASS with the icon layer present and the old text layer absent.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/use-deck-layers.ts frontend/tests/unit/composables/use-deck-layers.test.ts
git commit -m "feat: render schematic nodes with SVG icons"
```

### Task 3: Expose icon metadata in filter, toolbar, and side-panel UI

**Files:**
- Modify: `frontend/src/components/FilterPanel.vue`
- Modify: `frontend/src/components/TopToolbar.vue`
- Modify: `frontend/src/components/SidePanel.vue`
- Create: `frontend/tests/unit/components/filter-panel-icons.test.ts`
- Create: `frontend/tests/unit/components/top-toolbar-icons.test.ts`
- Create: `frontend/tests/unit/components/side-panel-icons.test.ts`

- [ ] **Step 1: Write the failing component tests**

Use these test shapes:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import FilterPanel from '@/components/FilterPanel.vue'

describe('FilterPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders a typed icon chip for each available NE type', () => {
    const wrapper = mount(FilterPanel)
    const iconLabels = wrapper.findAll('[data-test=\"ne-filter-icon\"]')
    expect(iconLabels).toHaveLength(5)
    expect(wrapper.text()).toContain('Access Point')
  })
})
```

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import TopToolbar from '@/components/TopToolbar.vue'
import { useFilterStore } from '@/stores/filter'

describe('TopToolbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders icon-backed chips for active type filters', () => {
    const filterStore = useFilterStore()
    filterStore.setTypeFilter(['router'])
    const wrapper = mount(TopToolbar)
    expect(wrapper.find('[data-test=\"active-type-chip-icon\"]').attributes('src')).toMatch(/router\.svg$/)
  })
})
```

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import SidePanel from '@/components/SidePanel.vue'
import { useSelectionStore } from '@/stores/selection'
import { useTopologyStore } from '@/stores/topology'

describe('SidePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows the NE icon beside the selected element type', async () => {
    const topologyStore = useTopologyStore()
    topologyStore.mergeTileElements('z0/x0/y0', {
      elements: [
        {
          id: 'el-1',
          type: 'firewall',
          label: 'fw-1',
          lng: 0,
          lat: 0,
          version: 1,
          updatedAt: '2026-01-01T00:00:00Z',
          properties: {},
        },
      ],
      clusters: [],
      generation: 1,
      removedIds: [],
    })

    const selectionStore = useSelectionStore()
    selectionStore.selectElement('el-1')

    const wrapper = mount(SidePanel, {
      global: {
        stubs: {
          BreadcrumbTrail: true,
          FilterPanel: true,
        },
      },
    })
    expect(wrapper.find('[data-test=\"detail-type-icon\"]').attributes('src')).toMatch(/firewall\.svg$/)
  })
})
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `cd frontend && npm run test:unit -- tests/unit/components/filter-panel-icons.test.ts tests/unit/components/top-toolbar-icons.test.ts tests/unit/components/side-panel-icons.test.ts`
Expected: FAIL because the components do not render any icon markup yet.

- [ ] **Step 3: Update the Vue components to consume shared icon metadata**

Apply these patterns:

```ts
import { KNOWN_NE_TYPES, getNeIconSpec } from '@/constants/ne-icons'

const availableTypes = KNOWN_NE_TYPES
const describeType = (type: string) => getNeIconSpec(type)
```

```vue
<label v-for="t in availableTypes" :key="t" class="filter-checkbox">
  <input
    type="checkbox"
    :checked="filterStore.criteria.types.includes(t)"
    @change="filterStore.toggleType(t)"
  />
  <img
    :src="describeType(t).iconUrl"
    :alt="describeType(t).label"
    class="type-icon"
    data-test="ne-filter-icon"
  />
  <span>{{ describeType(t).label }}</span>
</label>
```

```vue
<span v-for="t in filterStore.criteria.types" :key="'type-' + t" class="chip chip-type">
  <img
    :src="getNeIconSpec(t).iconUrl"
    :alt="getNeIconSpec(t).label"
    class="chip-icon"
    data-test="active-type-chip-icon"
  />
  {{ getNeIconSpec(t).label }}
  <button class="chip-remove" @click="filterStore.toggleType(t)">&times;</button>
</span>
```

```vue
<dd class="type-detail">
  <img
    :src="getNeIconSpec(element.type).iconUrl"
    :alt="getNeIconSpec(element.type).label"
    class="detail-type-icon"
    data-test="detail-type-icon"
  />
  <span>{{ getNeIconSpec(element.type).label }}</span>
</dd>
```

Add small scoped styles so the SVGs are legible on the existing dark panels. Keep sizing modest: roughly 16px in lists/chips and 20px in the detail panel.

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `cd frontend && npm run test:unit -- tests/unit/components/filter-panel-icons.test.ts tests/unit/components/top-toolbar-icons.test.ts tests/unit/components/side-panel-icons.test.ts`
Expected: PASS with all icon selectors present.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/FilterPanel.vue frontend/src/components/TopToolbar.vue frontend/src/components/SidePanel.vue frontend/tests/unit/components/filter-panel-icons.test.ts frontend/tests/unit/components/top-toolbar-icons.test.ts frontend/tests/unit/components/side-panel-icons.test.ts
git commit -m "feat: surface NE icons across topology UI"
```

### Task 4: Full verification and cleanup

**Files:**
- Modify: `frontend/src/composables/use-deck-layers.ts` (only if verification reveals tuning issues)
- Modify: `frontend/src/components/FilterPanel.vue` (only if verification reveals spacing issues)
- Modify: `frontend/src/components/TopToolbar.vue` (only if verification reveals spacing issues)
- Modify: `frontend/src/components/SidePanel.vue` (only if verification reveals spacing issues)

- [ ] **Step 1: Run the focused frontend unit suite**

Run:

```bash
cd frontend && npm run test:unit -- \
  tests/unit/constants/ne-icons.test.ts \
  tests/unit/composables/use-deck-layers.test.ts \
  tests/unit/components/filter-panel-icons.test.ts \
  tests/unit/components/top-toolbar-icons.test.ts \
  tests/unit/components/side-panel-icons.test.ts
```

Expected: PASS for all new tests.

- [ ] **Step 2: Run the frontend type check**

Run: `cd frontend && npm run type-check`
Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run the production frontend build**

Run: `cd frontend && npm run build`
Expected: PASS with the SVG assets emitted into the Vite build output.

- [ ] **Step 4: Manually verify the key UI surfaces**

Run: `cd frontend && npm run dev`

Check:
- Schematic view shows SVG device icons instead of colored circles + text abbreviations
- Selection halo still appears around selected nodes
- Filter list shows five labeled type icons
- Toolbar active chips show icon + human-readable NE type label
- Side-panel detail and search views show the correct icon for the selected/result element
- Unknown or future types fall back safely instead of breaking rendering

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/use-deck-layers.ts frontend/src/components/FilterPanel.vue frontend/src/components/TopToolbar.vue frontend/src/components/SidePanel.vue frontend/tests/unit/constants/ne-icons.test.ts frontend/tests/unit/composables/use-deck-layers.test.ts frontend/tests/unit/components/filter-panel-icons.test.ts frontend/tests/unit/components/top-toolbar-icons.test.ts frontend/tests/unit/components/side-panel-icons.test.ts
git commit -m "test: verify NE icon system integration"
```
