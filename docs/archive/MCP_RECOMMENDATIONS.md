# MCP Recommendations

This project already has strong local leverage from Serena, built-in web access, native repo tools, and Playwright. New MCPs should fill real gaps rather than duplicate those capabilities.

## Add Now

### Context7 MCP

- Best fit for current library and framework documentation.
- High leverage for fast-moving dependencies in this repo, including React, Vite, Vitest, Playwright, and Konva.
- Useful across harnesses because Schema-Lab keeps project knowledge in open repo-local skills.
- References:
  - [Context7 overview](https://context7.com/docs/overview)
  - [Context7 skills support](https://context7.com/docs/skills)

### Chrome DevTools MCP

- Best fit for frontend runtime debugging that complements Playwright.
- Useful for browser-side inspection, layout debugging, performance work, network analysis, and verifying issues that are awkward to capture in a scripted smoke alone.
- Reference:
  - [Chrome DevTools MCP announcement](https://developer.chrome.com/blog/chrome-devtools-mcp)

## Add Later

### Sentry MCP

- Add only once Schema-Lab has meaningful deployed usage and Sentry telemetry to inspect.
- At that point it becomes valuable for error triage, failure clustering, and debugging real user issues.
- Reference:
  - [getsentry/sentry-mcp](https://github.com/getsentry/sentry-mcp)

## Do Not Prioritize

- Generic filesystem, git, browser, or search MCPs
- GitHub, Figma, or Vercel-equivalent MCPs when those capabilities are already covered in the current environment
- Any MCP that mainly increases tool count without solving a specific recurring bottleneck

## Discovery Source

- Start from the official registry, but treat it as an evolving ecosystem rather than a guarantee of maturity:
  - [Model Context Protocol Registry](https://modelcontextprotocol.io/registry/about)
