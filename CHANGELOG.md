# Changelog

## 0.1.0

- Added the explicit schema version-chain builder.
- Added typed document definitions with `decode`, `encode`, `create`,
  `validate`, and `inspect`.
- Renamed the document definition version-chain option to `versions`.
- Removed the implicit `schema()` version-chain helper.
- Removed the throwing `migrate()` document method in favor of `decode`
  results carrying the latest envelope.
- Made document boundary reads and writes explicit with non-throwing `decode`
  and `encode` result statuses.
- Added Standard Schema v1 support and made `encode`, `create`, and `validate`
  promise-returning APIs so async validators work consistently.
- Removed legacy `parse(input)` and `safeParse(input)` schema adapter support;
  schemas now use the Standard Schema v1 contract.
- Preserved configured argument types for `create` factories.
- Added typed errors, Standard Schema support, inference helpers, runtime tests,
  type-level tests, and enforced 100% coverage gates.
