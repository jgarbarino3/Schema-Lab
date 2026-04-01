# Schema-Lab

Schema-Lab is a browser-based optical breadboard layout editor for ultrafast optics setups such as FROG, Z-scan, and related lab schematics.

Stage 1 in this repository implements:

- millimeter-first breadboard geometry
- grid-based optical component placement
- zoom and pan as view transforms only
- rotation-aware optical ports
- JSON scene import/export
- Vitest coverage for core geometry and serialization helpers

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

## Structure

- `src/domain`: millimeter-space scene model, presets, geometry, serialization, component catalog
- `src/state`: Zustand editor state and actions
- `src/canvas`: Konva rendering and interaction logic
- `src/ui`: toolbar, library, inspector, and JSON workflow
- `src/test`: Stage 1 unit tests

Durable project conventions live in [`AGENTS.md`](/Users/joegarbarino/Desktop/Schema-Lab/AGENTS.md).
