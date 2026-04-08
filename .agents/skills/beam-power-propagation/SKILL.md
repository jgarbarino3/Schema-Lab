---
name: beam-power-propagation
description: Use when changing Schema-Lab deterministic beam tracing, power bookkeeping, polarization, filters, delay lines, OPA behavior, or any downstream warning or readout logic that consumes trace output.
---

# Beam Power Propagation

Use this skill when a task changes how beams are deterministically traced through a scene.

## Triggers

- beam-path traversal and termination rules
- optical power bookkeeping
- polarization state propagation
- filter, splitter, mirror, delay-line, or OPA input and output behavior
- beam selection snapshots, trace summaries, and downstream consumers of trace output
- warnings or readouts that depend on trace results

## Invariants

- Build tracing from serialized scene data, world ports, and component metadata. Never depend on Konva scene nodes.
- Keep propagation logic pure and replayable from scene JSON.
- Treat power bookkeeping as a consumer of deterministic traversal, not as an alternate trace path.
- Use explicit per-component rules for split, reflect, transmit, absorb, delay, or terminate behavior.
- Warnings, readouts, and overlays must consume trace output rather than inventing separate physics truth from renderer state.

## Current Repo Concerns

- The deterministic layer now supports more than simple path traversal, including polarization-aware behavior, filters, delay lines, and OPA-specific semantics.
- Beam selection and inspection UIs depend on stable trace snapshots.
- Physics changes must preserve replayability and must not leak renderer assumptions into the trace model.

## Validation

- Add or update focused unit tests in `src/test` for changed beam behavior.
- If the change affects visible optics behavior or readouts, run:
  - `node output/playwright/optics-physics-smoke.mjs http://127.0.0.1:5173/`
- If warnings or overlays change because of the trace update, validate those consumers explicitly.

## Out Of Scope

- Workspace geometry and surface targeting belong in `layout-world-geometry`.
- Gaussian or paraxial analysis that augments the deterministic trace belongs in `gaussian-beam-layer`.
