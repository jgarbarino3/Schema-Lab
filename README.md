# Schema-Lab

Schema-Lab is a browser-based optics workspace for laying out, tracing, reviewing, and exporting ultrafast optics setups such as FROG, Z-scan, delay-line, OPA, and related lab schematics.

## Platform Note

Schema-Lab is designed for desktop and laptop workflows with a wide canvas, keyboard, and pointer. Mobile browsers are not a primary target because practical optical-layout work needs enough screen space to inspect boards, panels, beam paths, and export controls at once.

The current repository includes:

- millimeter-first geometry for breadboards, optical tables, component footprints, anchors, and ports
- multi-surface placement with breadboards hosted on an optical table
- deterministic beam tracing, beam inspection, and warning generation
- optional Gaussian-beam analysis, overlays, and warning support
- interpreted SVG import with reliable-path mapping and ambiguity review
- scoped export flows for SVG, DXF, PDF, PPTX, and shared vector-scene output
- onboarding, example setup, help, and browser-smoke coverage for critical UI flows

## Stack

- React
- TypeScript
- Vite
- Konva / react-konva
- Zustand
- Vitest

## Commands

```bash
npm install
npm run dev
npm run test
npm run build
```

Useful browser smokes live under `output/playwright/`, including optical-table, optics-physics, SVG-import, and broader UX checks.

## Structure

- `src/domain`: millimeter-space scene model, workspace geometry, tracing, Gaussian analysis, import/export, warnings
- `src/state`: Zustand editor state and actions
- `src/canvas`: Konva rendering and interaction logic
- `src/ui`: toolbar, library, inspector, onboarding, warnings, import/export, and modal workflows
- `src/test`: unit coverage for geometry, tracing, Gaussian analysis, import/export, and serialization
- `.agents/skills`: repo-local skills that capture current project contracts for coding agents

Durable project conventions live in [`AGENTS.md`](/Users/joegarbarino/Desktop/Schema-Lab/AGENTS.md).
