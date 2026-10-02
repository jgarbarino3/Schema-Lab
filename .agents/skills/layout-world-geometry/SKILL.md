---
name: layout-world-geometry
description: Use when working on Schema-Lab workspace geometry, surface targeting, coordinate transforms, snapping, component footprints, anchors, ports, annotations, or any logic where physical millimeters remain the source of truth.
---

# Layout World Geometry

Use this skill when a task changes workspace geometry or placement semantics.

## Triggers

- optical-table and breadboard workspace behavior
- `hostSurfaceId`, active host targeting, and multi-surface placement or drag logic
- world/local transforms for boards, components, ports, or annotations
- snapping, anchor reconciliation, rotated bounds, and hole-field validation
- scene serialization for geometry-bearing data

## Invariants

- Persist geometry in physical millimeters only. Screen-space coordinates are derived view data.
- Keep domain geometry separate from Konva rendering and separate from Zustand editor state.
- Resolve placement against explicit surface semantics: optical table fallback, breadboard-first when the pointer is over a valid breadboard surface.
- Derive world ports from component definitions plus instance transform. Do not persist transformed ports.
- Keep scene JSON versioned and exclude selection state, panel state, and viewport state.
- Preserve backward compatibility for scene data when adding geometry-bearing fields such as mount-plane metadata.

## Current Repo Concerns

- Schema-Lab now supports multi-surface workspaces, including optical tables with multiple breadboards.
- Breadboards may be rotated and must still participate in deterministic world/local resolution.
- Placement, drag, and export scope all depend on correct `hostSurfaceId` handling.
- Annotation lines are world-space content and must not invent alternate geometry truth.
- Mount-plane metadata is currently rendering and UI support data, not 3D beam-trace truth.

## Validation

- Add or update unit tests for coordinate transforms, snapping, rotated bounds, port transforms, host-surface resolution, and serialization.
- Run the relevant geometry-focused tests in `src/test`.
- If the change touches optical-table interactions or visible surface targeting, run the table-mode smoke:
  - `node scripts/playwright-smoke/optical-table-smoke.mjs http://127.0.0.1:4173/`

## Out Of Scope

- Deterministic beam propagation rules belong in `beam-power-propagation`.
- Gaussian or paraxial analysis belongs in `gaussian-beam-layer`.
- Renderer-only polish that does not affect geometry truth should not back-drive domain rules.
