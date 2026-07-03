# Goal: Folded Mirror Pair For FROG-Style Delay Schematics

Use Krypton Execution to execute `docs/goals/folded-delay-pair/PLAN.md`.

Core rules:
- Treat `PLAN.md` as the source plan.
- Preserve the ownership contract: delay stages own timing; folded mirror pairs are visual/layout payloads in v1.
- Do not add arbitrary 45 degree persisted rotations.
- Do not add true two-bounce beam tracing unless a later plan explicitly changes the contract.
- Capture target-perspective evidence from tests, scene JSON roundtrip, browser runtime state, and a screenshot.
- Say "implemented but unproven" if runtime evidence cannot be captured.
