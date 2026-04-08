---
name: gaussian-beam-layer
description: Use when changing Schema-Lab Gaussian or paraxial beam analysis, waist markers, analytical warnings, or export overlays that augment deterministic beam traces.
---

# Gaussian Beam Layer

Use this skill when a task changes analytical beam behavior layered on top of deterministic traces.

## Triggers

- Gaussian segment analysis and q-parameter propagation
- waist markers, beam-size overlays, or analytical annotations
- Gaussian-driven warnings such as overfill or component-compatibility checks
- export overlays or reports that include Gaussian analysis

## Invariants

- Gaussian analysis is optional and augments deterministic trace output; it does not redefine layout truth or tracing truth.
- Keep paraxial calculations separate from renderer concerns and separate from editor selection state.
- Prefer explicit interfaces for wavelength, waist, q-parameter, and propagation segments.
- Analytical warnings should consume Gaussian results derived from the trace, not bypass the deterministic layer.

## Current Repo Concerns

- Schema-Lab already uses Gaussian analysis for visual overlays and warning generation.
- Export flows may include Gaussian overlays, so analytical changes can affect both canvas and export output.
- The layout scene model remains millimeter-first and should not be distorted to fit the Gaussian layer.

## Validation

- Add or update unit tests for Gaussian propagation and warning behavior.
- Run the most relevant visible-flow smoke when overlays or warning review change.
- Re-check exports if the task affects Gaussian overlay output.

## Out Of Scope

- Deterministic path traversal and power bookkeeping belong in `beam-power-propagation`.
- Surface targeting, placement, and host-surface geometry belong in `layout-world-geometry`.
