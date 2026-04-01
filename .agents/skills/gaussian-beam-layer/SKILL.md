---
name: gaussian-beam-layer
description: Use when adding Schema-Lab Stage 3 paraxial or Gaussian-beam analysis on top of deterministic beam paths without changing the Stage 1 layout data model.
---

# Gaussian Beam Layer

- This skill is for Stage 3 work only.
- Build Gaussian-beam analysis as an optional analytical layer that consumes deterministic beam paths and component metadata.
- Do not let Gaussian parameters replace or distort the Stage 1 layout model; they augment it.
- Keep paraxial calculations separate from renderer concerns and separate from breadboard editing state.
- Prefer explicit interfaces for wavelength, waist, q-parameter, and propagation segments so the analysis layer can be enabled or disabled cleanly.
