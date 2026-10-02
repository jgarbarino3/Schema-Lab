# Schema-Lab Conventions

## Core Rules

- Treat the repository root as the canonical project root.
- Physical millimeters are the only persisted geometry unit for boards, holes, footprints, anchors, ports, and future beam paths.
- Zoom and pan are view transforms only. Screen-space coordinates may be derived for rendering and input handling, but they are never the source of truth.
- Keep the optics domain model separate from Konva rendering code and separate both from Zustand UI/editor state.
- Stage 1 rotations are quarter turns only: `0`, `90`, `180`, `270` degrees.

## Modeling

- Breadboard geometry is derived from explicit physical parameters: width, height, hole spacing, edge margin, density, finish, thickness, and counterbore pattern.
- Component definitions stay data-driven. Each definition must declare footprint bounds in local millimeter space, a placement anchor at local origin, label/type/category metadata, and rotation-aware ports.
- World ports are derived from component definitions plus instance rotation and anchor position. Do not persist transformed ports separately.
- Scene JSON must be versioned and must exclude selection state, open panels, and viewport state.

## Implementation Style

- Favor explicit geometry helpers over generic math abstractions.
- Prefer readable files and direct control flow over framework-heavy indirection.
- Keep renderer components dumb: they consume already-defined world geometry and viewport state rather than inventing domain rules.
- When breadboard geometry changes, reconcile component anchors against the valid hole field rather than leaving stale off-grid positions.

## Testing

- Add or update unit tests when changing coordinate transforms, snapping, rotated bounds, port transforms, or scene serialization.
- Test world-space behavior first; avoid relying on UI tests for geometry correctness.
- For schematic-builder loops, use: real user task -> source/import/export roundtrip -> browser/runtime proof -> geometry tests -> public claim update.
- Physical millimeters and versioned scene JSON remain the source of truth; browser screenshots and runtime checks verify user-visible behavior, not persisted geometry authority.
