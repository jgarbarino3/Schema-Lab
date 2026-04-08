# Release Versioning

Schema-Lab release history is maintained manually and should reflect milestone updates, not every commit or push.

## Rules

- Keep version numbers to one decimal place only.
- Do not include dates in the in-app history.
- Keep each version summary short and product-facing.
- Add highlights only when they help scan the release quickly.
- Use Git history as reference material, but curate the final wording manually.

## When To Propose A New Version

- The user explicitly asks for a release-history update.
- A major new capability family lands, such as a new workspace mode, major import/export workflow, meaningful analysis upgrade, or broad UI maturity jump.
- There is enough clustered progress that the in-app history would feel stale if left unchanged.

## Default Behavior

- Do not bump the version automatically after routine pushes.
- When a bump seems justified, propose the next version number and a short summary first.
- Treat `src/content/versionHistory.ts` as the source of truth for the app UI.
- When the user approves a milestone bump, update `src/content/versionHistory.ts` in the same pass so the manual history stays current.
- If a pushed pass noticeably improves workflow clarity or day-to-day usability, it can justify a small version bump even when it is mostly UX polish.
- Summaries should emphasize notable additions and user-facing improvements; avoid calling out removals unless the user specifically wants them highlighted.
