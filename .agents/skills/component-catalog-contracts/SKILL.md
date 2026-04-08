---
name: component-catalog-contracts
description: Use when adding or changing Schema-Lab component types, variants, ports, defaults, render hints, import keywords, warnings, or physics mappings so the catalog contract stays consistent across the repo.
---

# Component Catalog Contracts

Use this skill when a task changes what a component is, how it is placed, or how the rest of the app interprets it.

## Triggers

- new component types, categories, variants, or presets
- footprint, anchor, label, or rotation-aware port changes
- default instance values, inspector controls, or render hints
- SVG-import keywords or heuristic mappings
- deterministic beam behavior, warnings, or export behavior tied to a component

## Invariants

- Component definitions stay data-driven and geometry lives in local millimeter space.
- A component change is not complete until catalog data, defaults, ports, tracing behavior, warnings, import/export, and tests agree.
- Domain meaning must not be inferred from renderer-only details.
- World ports are derived from the component contract, not stored separately.

## Required Surfaces To Check

- `src/domain/componentCatalog.ts` and related domain defaults or presets
- placement and inspector flows in `src/state` and `src/ui`
- tracing and warning consumers in `src/domain/beamTracing.ts`, `src/domain/gaussian.ts`, and `src/domain/sceneWarnings.ts`
- import/export consumers such as `src/domain/svgImport.ts`, `src/domain/vectorExportScene.ts`, and format exporters
- unit tests and any targeted Playwright smoke that exercises the affected component family

## Validation

- Add or update unit tests covering footprint, ports, and any changed behavior.
- If the component affects beam logic, run the relevant physics smoke:
  - `node output/playwright/optics-physics-smoke.mjs http://127.0.0.1:5173/`
- If the component changes general canvas workflows, run the most relevant UI smoke under `output/playwright/`.

## Out Of Scope

- Broad workspace geometry or host-surface semantics belong in `layout-world-geometry`.
- Import calibration or ambiguity-review workflow design belongs in `svg-import-and-review`.
