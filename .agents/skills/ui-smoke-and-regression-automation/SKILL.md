---
name: ui-smoke-and-regression-automation
description: Use when changing Schema-Lab workspace flows, tutorial or help UX, warnings, import/export UI, or canvas interactions that should be covered by browser smoke automation.
---

# UI Smoke And Regression Automation

Use this skill when a task changes user-visible workflows and should be protected with browser automation.

## Triggers

- workspace-mode flows, toolbar changes, inspector behavior, or canvas interaction changes
- tutorial, onboarding, help, warning review, import/export, or modal UX changes
- regressions that are easiest to prove in a real browser rather than unit tests alone

## Invariants

- Prefer stable, world-space or semantic targeting over fragile ratio-based click scripts.
- Re-check collapsed component-library groups before assuming a catalog item is visible.
- Keep screenshots, MCP console captures, and test-result artifacts local unless the user explicitly wants them committed.
- Use smoke automation to verify real workflows, not to replace domain-level unit tests.

## Current Repo Concerns

- Schema-Lab has maintained focused smoke scripts in `scripts/playwright-smoke/` for SVG import, optical-table mode, touch interactions, and broader UI clarity. The legacy `output/playwright/optics-physics-smoke.mjs` remains useful for physics-specific validation.
- Multi-surface placement and table-mode behavior are especially prone to UI regressions that unit tests do not fully cover.

## Validation

- Choose the smallest relevant smoke path for the change.
- Common entry points:
  - `node scripts/playwright-smoke/optical-table-smoke.mjs http://127.0.0.1:4173/`
  - `node output/playwright/optics-physics-smoke.mjs http://127.0.0.1:5173/`
  - `node scripts/playwright-smoke/drawing-import-auto-calibration-smoke.mjs http://127.0.0.1:4173/`
  - `node scripts/playwright-smoke/ux-clarity-smoke.mjs http://127.0.0.1:4173/`
- Pair browser smoke with unit tests for any domain logic affected by the same change.

## Out Of Scope

- This skill does not define product behavior; it defines how to regression-check it.
- Low-level geometry contracts still belong in `layout-world-geometry`.
