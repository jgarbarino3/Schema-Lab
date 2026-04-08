---
name: svg-import-and-review
description: Use when changing interpreted SVG import, calibration, heuristics, ambiguity handling, merge or replace flows, manual review UX, or annotation-segment import.
---

# SVG Import And Review

Use this skill when a task changes how external SVG content becomes a Schema-Lab scene.

## Triggers

- interpreted SVG parsing and normalization
- scale calibration, axis assumptions, or board-size inference
- heuristic component suggestions and keyword matching
- ambiguity detection and manual-review modal behavior
- merge vs replace flows and imported annotation segments

## Invariants

- Imported scenes must still satisfy the same geometry and serialization rules as hand-authored scenes.
- Reliable imports and ambiguous imports are both first-class flows and must stay testable.
- Import heuristics may suggest component meaning, but they must not bypass explicit ambiguity handling when confidence is weak.
- Imported annotations remain world-space scene content, not a separate rendering-only layer.

## Current Repo Concerns

- Schema-Lab supports automatic mapping for common optics and a manual-review workflow for uncertain cases.
- Import flows interact with existing scene content through merge and replace behavior.
- Import correctness affects warnings, tracing, and export because imported components become normal scene data.

## Validation

- Add or update unit tests for reliable and ambiguous import cases.
- Re-run the SVG import smoke when workflow or mapping behavior changes:
  - `node output/playwright/svg-import-line-review.mjs http://127.0.0.1:5173/`
- If import changes affect scene warnings or export, validate those dependent flows as well.

## Out Of Scope

- Export formatting belongs in `export-pipeline-and-scoped-output`.
- Core component-definition changes belong in `component-catalog-contracts`.
