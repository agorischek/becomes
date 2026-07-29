# Maintenance

`becomes` is an active reusable npm library maintained by Garden.

## Dependency policy

- The repository's default maintenance surface is the package at `.` with
  `library` distribution and npm delivery.
- All current package dependencies are development tooling. Garden may merge
  verified Dependabot updates to them, including individually tested major
  updates, when the complete CI suite passes.
- Routine minor and patch updates are grouped. Development major updates remain
  individual so failures are attributable.
- If a runtime or peer dependency is added, update this policy and
  `.github/dependabot.yml` deliberately. Routine maintenance must not
  automatically raise the package's public minimum dependency versions.
- Routine version updates run weekly after a seven-day cooldown. Dependabot
  security updates are enabled separately and are not delayed by that cooldown.

## Release policy

Development-only dependency updates do not change the published consumer
artifact and do not trigger a release. Garden release automation remains
disabled.

The existing release workflow publishes to npm when a maintainer creates a
GitHub Release whose tag matches the committed package version. It does not
implement Garden's `prepare-release.yml` contract. Add and prove that contract
before enabling Garden release orchestration.

## Safety controls

Pull requests must pass the repository's required `Check` job and receive one
approval. Garden only acts on verified Dependabot pull requests that satisfy its
dependency-file, provenance, check, and mergeability rules. Human-authored and
other bot pull requests remain subject to the normal review policy.
