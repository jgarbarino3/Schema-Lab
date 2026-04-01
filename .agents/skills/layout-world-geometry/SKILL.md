---
name: layout-world-geometry
description: Use when working on Schema-Lab's breadboard layout editor, coordinate transforms, snapping, component footprints, anchors, ports, or any logic where physical millimeters are the source of truth.
---

# Layout World Geometry

- Persist physical geometry in millimeters only.
- Treat `zoomPxPerMm`, canvas size, and camera center as view state, not domain state.
- Breadboard holes are derived from board dimensions, edge margin, spacing, and density. Do not hand-place hole coordinates in renderer code.
- Each component instance snaps by its placement anchor, not by its footprint bounds.
- Define component footprints and ports in local coordinates around the placement anchor at `(0, 0)`.
- Derive world ports from `anchorMm + quarter-turn rotation`; never persist transformed ports.
- Keep Konva code downstream from domain helpers. Rendering may scale or translate shapes, but may not redefine geometry rules.
- If geometry behavior changes, add or update tests for transforms, snapping, rotated bounds, or ports before considering the task complete.
