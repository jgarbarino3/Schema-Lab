# Folded Mirror Pair For FROG-Style Delay Schematics Implementation Plan

**Intent:** Add a first-class folded mirror pair that makes FROG-style delay-stage schematics readable without changing the scene geometry contract.
**Current Behavior:** Users can place mirrors and delay stages separately, but there is no compact two-mirror delay payload that can attach to a stage.
**Expected Outcome:** Users can add a folded mirror pair, attach it to a delay stage optic seat, save/load it, and see it in canvas and vector exports.
**Target-Perspective Output:** A delay stage can visibly carry a two-mirror folded payload while the delay stage remains the only timing-bearing component.
**Truth Owner:** Domain component catalog and versioned scene JSON.
**Contract Boundary:** Component definitions supply physical-mm bounds, mount behavior, variants, glyph identity, and physics ownership; renderers only draw resolved data.
**Cutover:** Add a new `folded-mirror-pair` component instead of reusing telescope, arbitrary rotations, or generated mirror groups.
**Displaced Path:** Manual placement of two separate mirrors for a stage-top delay payload is no longer the recommended v1 workflow.
**Value Density:** One compact component unlocks the schematic use case while avoiding beam-tracing redesign.
**Acceptance Evidence:** Unit tests, JSON roundtrip, browser smoke, and build/typecheck.
**Evidence Lane:** Schematic-builder loop: real user task -> scene JSON roundtrip -> browser/runtime proof -> geometry tests -> public claim update.
**Kill Criteria:** Stop before introducing non-quarter-turn persisted rotations or true internal two-bounce tracing.
**Architecture Slice:** `types`, `componentCatalog`, labels, glyph rendering, vector export, SVG keywords, editor/serialization/beam tests, and one smoke script.
**Plan Review Gate:** Requires post-implementation review before reporting complete.

## Tasks

1. Add domain/catalog model for `folded-mirror-pair` with two variants, `none` physics, compact clamp-capable support bounds, label prefix, and stage optic-seat eligibility.
2. Add simple/enhanced glyph and vector-export drawing for a compact base with two internal 45 degree mirror strokes.
3. Add tests for catalog resolution, stage attachment, serialization, and delay-stage-only beam timing.
4. Add a runtime smoke that creates a delay stage, attaches a folded pair, changes delay position, round-trips JSON, and captures a screenshot.
5. Run targeted tests, full test suite, typecheck, build, and the smoke; repair red checks up to three local passes.
