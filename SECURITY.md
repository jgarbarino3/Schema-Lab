# Security Policy

## Supported Version

Security fixes are currently handled on the latest `main` branch and latest
GitHub release.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately by opening a GitHub security
advisory for this repository. If that is not available, contact the maintainer
through the GitHub profile associated with the repository.

Please do not publicly disclose a vulnerability until it has been triaged.

## Areas of Interest

Schema-Lab is a browser-based editor. The highest-risk areas are:

- SVG and raster import parsing
- vector export generation
- scene JSON import
- file download/export flows

Reports are most useful when they include a minimal file or scene that
reproduces the issue, the browser used, and the observed impact.
