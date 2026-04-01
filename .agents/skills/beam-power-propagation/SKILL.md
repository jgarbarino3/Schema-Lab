---
name: beam-power-propagation
description: Use when adding Schema-Lab Stage 2 deterministic beam-path traversal and beam-power bookkeeping on top of the Stage 1 layout scene model.
---

# Beam Power Propagation

- This skill is for Stage 2 work only. Do not use it to justify layout-only shortcuts in Stage 1.
- Build deterministic beam propagation from component world ports and component metadata, not from Konva scene nodes.
- Keep propagation logic pure and replayable from serialized scene data.
- Treat optical power bookkeeping as a layer on top of deterministic path traversal.
- Use explicit split, reflect, absorb, and terminate rules per component type rather than hidden renderer behavior.
- Preserve the Stage 1 contract: millimeter geometry and component orientation live in the domain model, while propagation reads that model without owning it.
