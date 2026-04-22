# NE Icon Design

## Goal

Define a production-ready icon system for network element (NE) types in the topology viewer. The icons should feel closer to real networking hardware than abstract symbols, while remaining readable at UI icon sizes and maintainable as clean SVG assets.

## Scope

This design covers the five NE types currently used by the application data model:

- `router`
- `switch`
- `server`
- `firewall`
- `access-point`

This design does not cover link icons, cluster markers, logos, vendor-specific device branding, or full frontend integration details.

## Chosen Direction

### Visual language

The icon family will use a `Product Silhouette` direction:

- Each icon should resemble a plausible network device or appliance.
- Shapes should feel like hardware products, not generic geometry.
- Icons must avoid copying any specific vendor chassis, bezel, or trademarked industrial design.
- The visual style should sit between literal device illustration and simplified UI iconography.

### Identity system

Type identity will be carried primarily through `color-coded by type`, reinforced by a small number of shape cues unique to each NE class.

### Production pipeline

The recommended pipeline is:

1. Use the GPT image model to generate concept references for the five device families.
2. Select the strongest reference direction.
3. Redraw each approved icon as clean, hand-authored SVG for production use.

Automatic vector tracing is explicitly out of scope for production assets because it is likely to introduce noisy paths, inconsistent geometry, and hard-to-maintain SVG output.

## Design Principles

- Icons must read clearly at small sizes used in filters, legends, panels, and overlays.
- The set must look like one family: consistent perspective, corner treatment, stroke behavior, and detailing density.
- Realism should come from silhouette and front-face details, not from photo-like shading.
- Internal detail should be limited to a few high-signal device features such as ports, vents, bays, LEDs, antennas, or signal arcs.
- Color should help users distinguish NE types quickly without becoming the only way to tell icons apart.
- SVG output should remain compact and easy to edit.

## Shared Geometry Rules

- Use a consistent three-quarter or slightly front-biased perspective across the full set.
- Keep all icons within the same square viewBox and similar visual weight.
- Favor bold outer silhouettes with restrained internal linework.
- Use the same radius language across all devices so corners feel related.
- Maintain a consistent light direction if subtle shading is used.
- Avoid excessive gradients, texture noise, reflections, or tiny decorative parts.

## Per-Type Visual Spec

### Router

The router icon should read as a routing appliance rather than a generic server box.

Visual cues:

- Low-profile horizontal device body
- Slightly assertive front face with a central control area or uplink emphasis
- Limited port grouping that feels important rather than dense
- Directional or traffic-oriented cue integrated into the faceplate design

Avoid:

- Looking like a consumer Wi-Fi router with oversized external antennas
- Becoming visually identical to the switch icon

Primary color: `blue`

## Switch

The switch icon should communicate port density and access-layer hardware.

Visual cues:

- Flat rack-style or desktop-switch silhouette
- Front panel with dense repeated port pattern
- Clean status-light rhythm
- Minimal "brains," more emphasis on connectivity surface

Avoid:

- Looking like a server rack unit with drive bays
- Looking so dense that it turns into visual noise at small size

Primary color: `teal`

## Server

The server icon should read as compute/storage equipment rather than general network transport gear.

Visual cues:

- Rack unit or compact chassis silhouette
- Bay, slot, or tray emphasis
- More structural segmentation than router or switch
- Balanced, rectangular face layout

Avoid:

- Port-density patterns that make it read as a switch
- Tower-server proportions unless a later requirement explicitly asks for that

Primary color: `slate`

## Firewall

The firewall icon should feel like a specialized security appliance.

Visual cues:

- Tighter, more defensive silhouette posture
- Sharper edge language than the other icons, while staying in-family
- Strong faceplate center or badge area
- Optional restrained shield/barrier cue integrated into the device design

Avoid:

- Literal shield-only symbolism that abandons the hardware silhouette
- Overly aggressive red treatment that feels like an alert badge instead of a device type

Primary color: `red-orange`

## Access Point

The access point icon should read as wireless infrastructure while staying aligned with the hardware-silhouette family.

Visual cues:

- Compact device body, wall/ceiling-mount-like or small appliance form
- Signal or broadcast cue integrated subtly into the silhouette
- Cleaner front face with fewer ports than the wired devices
- Distinctly lighter visual footprint than router, switch, server, and firewall

Avoid:

- Generic Wi‑Fi symbol with no device body
- Home-router styling with large external antennas unless later requirements change

Primary color: `amber`

## Color System

Recommended palette intent:

- `router`: trusted network blue
- `switch`: connectivity teal
- `server`: neutral slate
- `firewall`: warning/security red-orange
- `access-point`: wireless amber

Color should be applied through a controlled accent strategy:

- Primary body tint or faceplate accent
- Small LED or indicator highlights
- Optional soft shadow or gradient bias

A monochrome fallback should remain possible for contexts where color is unavailable. Shape cues must therefore stay meaningful on their own.

## SVG Output Requirements

- Final assets should be authored as editable SVG, not embedded raster images.
- Paths should be clean and intentionally grouped.
- Reuse simple shapes where possible instead of generating excessive anchor points.
- All icons should align to a shared export grid.
- Each asset should render cleanly at small UI sizes such as approximately 16 to 32 pixels and also remain usable at medium sizes in side panels or legends.

## Deliverables

The implementation phase should produce:

1. One concept sheet or prompt set for GPT image generation covering all five NE types in the approved style
2. One finalized SVG per NE type
3. A small shared style guide covering viewBox, sizing, color tokens, and usage notes

## Open Decisions Resolved By This Spec

- Realism level: hardware-inspired, not abstract
- Style family: `Product Silhouette`
- Type identity: color-coded by type
- Production method: GPT image references plus manual SVG cleanup

## Risks And Controls

### Risk: icons become too detailed for UI scale

Control:
Limit each icon to a dominant silhouette plus a few device-specific features.

### Risk: icons feel inconsistent across types

Control:
Use a shared perspective, radius language, shading discipline, and export grid.

### Risk: color carries too much meaning

Control:
Ensure every icon also has at least one distinct silhouette or face-layout cue.

### Risk: concepts drift into vendor imitation

Control:
Keep the forms plausible but generic, and avoid recognizable commercial chassis patterns.

## Testing And Validation

Validation for the implementation phase should include:

- Side-by-side review of all five icons at small and medium sizes
- Check for immediate recognizability by type
- Check for visual consistency as a family
- Verify SVGs remain lightweight and editable
- Verify icons still differentiate meaningfully in grayscale
