---
name: export-pipeline-and-scoped-output
description: Use when changing Schema-Lab SVG, DXF, PDF, PPTX, or vector export behavior, export scope, engineering presets, annotations, or Gaussian overlay output.
---

# Export Pipeline And Scoped Output

Use this skill when a task changes what Schema-Lab exports or how export scope is resolved.

## Triggers

- SVG, DXF, PDF, PPTX, or vector-scene export work
- breadboard-only vs full-scene export scope
- engineering presets, print scaling, or export rendering modes
- annotation-line inclusion, beam overlays, or Gaussian overlays in exported output
- host-surface filtering and multi-surface scene export behavior

## Invariants

- Export output must reflect domain scene truth, not ad hoc renderer state.
- Export scope must stay aligned with scene scope and host-surface filtering rules.
- Gaussian overlays augment exported traces; they do not redefine geometry or deterministic beam truth.
- Annotation output must preserve world-space intent across formats.

## Current Repo Concerns

- Schema-Lab exports through a shared vector-scene layer plus format-specific writers.
- Multi-surface workspaces require explicit filtering so breadboard-only exports do not silently include table-only content.
- Engineering-style exports must stay consistent with the same scene used by on-canvas warnings and analysis.

## Validation

- Update export-focused unit tests when the scene graph or scoping logic changes.
- Verify the affected export format manually when visual fidelity matters.
- If export behavior depends on canvas workflows, run the most relevant Playwright smoke before finalizing.

## Out Of Scope

- SVG interpretation and ambiguity handling belong in `svg-import-and-review`.
- Component definition changes belong in `component-catalog-contracts`.
