# Contributing to Schema-Lab

Thanks for taking a look at Schema-Lab. The project is an early-stage,
desktop-first optics layout workspace for research and lab documentation.

## Local Setup

```bash
npm install
npm run dev
```

Schema-Lab is designed for desktop and laptop screens with a keyboard and
pointer. Mobile browsers are not the main target.

## Checks

Before opening a pull request, run the checks that match your change:

```bash
npm run lint
npm run test
npm run build
npm run bundle:size
```

For UI, import/export, or workspace-flow changes, also run a preview server and
the browser smokes:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
npm run smoke:ci
```

## Project Conventions

- Persist physical geometry in millimeters.
- Keep zoom and pan as view transforms only.
- Keep domain geometry separate from Konva rendering and editor UI state.
- Add or update unit tests when changing snapping, transforms, ports, exports,
  imports, serialization, or warning behavior.

More detailed repo conventions live in `AGENTS.md`.

## Issues and Pull Requests

Good issues include the affected workflow, expected behavior, actual behavior,
browser/OS details, and a small scene or import fixture when possible.

Good pull requests stay focused, explain the user-facing change, and list the
verification commands that were run.
