# Implementation Plan

## 1. Project Baseline

- [ ] Confirm package entrypoint exports match the public API named in `SPEC.md`.
- [ ] Add a test runner and coverage tooling for Bun/TypeScript.
- [ ] Add type-level test tooling (`tsd`, `expect-type`, or equivalent).
- [ ] Add scripts for unit tests, type tests, coverage, and full CI checks.
- [ ] Keep `bun run check` as the main verification command.

## 2. Core Types

- [ ] Define `Schema<T>` / `StandardSchema<T>` support for schema-like objects with `parse(input): T`.
- [ ] Add optional support for schema-like objects with `safeParse(input)`.
- [ ] Implement `InferSchema<TSchema>`.
- [ ] Define `VersionId` as `number` initially, with type structure that can later expand to `string | number`.
- [ ] Define `Migration<From, To, Context = unknown>`.
- [ ] Define internal `VersionEntry` and normalized `InternalHistory` shapes.
- [ ] Define public inference helpers:
  - [ ] `InferLatest<TDocument>`
  - [ ] `InferVersion<TDocument, TVersion>`
  - [ ] `InferEnvelope<TDocument>`

## 3. Error Model

- [ ] Implement `BecomesErrorCode`.
- [ ] Implement `BecomesError` with stable `code`, optional `documentType`, optional `version`, and optional `cause`.
- [ ] Add helpers for consistently wrapping validation and migration failures.
- [ ] Ensure all public APIs return or throw typed errors using the codes from `SPEC.md`.

## 4. Schema Adapter Runtime

- [ ] Implement `parseWithSchema(schema, input)` for `.parse(input)`.
- [ ] Normalize parser failures into `BecomesError`.
- [ ] Add `.safeParse(input)` support if practical without compromising the minimal adapter model.
- [ ] Ensure parsed return values preserve inferred TypeScript payload types.

## 5. Explicit History API

- [ ] Implement `version(versionId, schema)`.
- [ ] Implement immutable `.becomes(nextVersionId, nextSchema, migration)` chaining.
- [ ] Preserve authored explicit version IDs exactly.
- [ ] Reject duplicate explicit version IDs at document-definition time or earlier.
- [ ] Treat explicit histories as linear authored chains rather than contiguous numeric ranges.
- [ ] Enforce migration input type as the previous schema payload.
- [ ] Enforce migration return type as the next schema payload or `Promise` of that payload.

## 6. Implicit History API

- [ ] Implement `schema(schema)`.
- [ ] Implement immutable `.becomes(nextSchema, migration)` chaining.
- [ ] Generate positional version IDs starting at `1`.
- [ ] Increment implicit version IDs by `1` for each `.becomes`.
- [ ] Normalize implicit histories to the same internal representation as explicit histories.
- [ ] Verify implicit and explicit APIs infer equivalent latest payload types.

## 7. Document Definition

- [ ] Implement `defineDocument(options)`.
- [ ] Support required `type` and `history` options.
- [ ] Support optional `create`.
- [ ] Support optional `context`.
- [ ] Support optional `envelope` key overrides:
  - [ ] `typeKey`, defaulting to `"type"`
  - [ ] `versionKey`, defaulting to `"version"`
  - [ ] `dataKey`, defaulting to `"data"`
- [ ] Support `validateBeforeMigration`, defaulting to `true`.
- [ ] Support `validateAfterMigration`, defaulting to `true`.
- [ ] Expose typed runtime metadata:
  - [ ] `type`
  - [ ] `latestVersion`
  - [ ] known versions/history as needed internally

## 8. Document Runtime APIs

- [ ] Implement `open(raw, options?)`.
- [ ] Parse unknown raw input as an envelope.
- [ ] Verify document type.
- [ ] Verify version presence.
- [ ] Reject unsupported versions.
- [ ] Validate payload against the declared version schema before migration.
- [ ] Apply each migration step in authored order until latest.
- [ ] Support async migrations.
- [ ] Validate migration output after each step when enabled.
- [ ] Return latest payload only.
- [ ] Implement `save(data)`.
- [ ] Validate latest payload before saving unless disabled by API design.
- [ ] Return latest-version envelope.
- [ ] Implement `create()`.
- [ ] Require the `create` option to exist before use.
- [ ] Return latest payload type.
- [ ] Implement `migrate(envelope, options?)`.
- [ ] Return latest-version envelope instead of payload.
- [ ] Implement `validate(raw)`.
- [ ] Validate envelope and declared-version payload without migrating.
- [ ] Implement `inspect(raw)`.
- [ ] Return document metadata without running migrations when possible.

## 9. Envelope Support

- [ ] Implement default envelope shape `{ type, version, data }`.
- [ ] Implement `InferEnvelope<TDocument>` as a union of every supported persisted envelope.
- [ ] Keep user schemas scoped to payload data only.
- [ ] Ensure envelope parsing handles non-object values as `INVALID_ENVELOPE`.
- [ ] Ensure custom envelope keys work consistently across `open`, `save`, `migrate`, `validate`, and `inspect`.

## 10. Runtime Tests

- [ ] Test opening a latest-version document without migration.
- [ ] Test opening an older document and migrating to latest.
- [ ] Test validation before migration.
- [ ] Test validation after each migration.
- [ ] Test rejecting a missing or malformed envelope.
- [ ] Test rejecting the wrong document type.
- [ ] Test rejecting a missing version.
- [ ] Test rejecting an unknown version.
- [ ] Test rejecting an invalid payload.
- [ ] Test wrapping thrown migration errors as `MIGRATION_FAILED`.
- [ ] Test rejecting invalid migration output as `INVALID_MIGRATION_OUTPUT`.
- [ ] Test saving latest payload with the correct envelope.
- [ ] Test `create()` returns the latest payload.
- [ ] Test `migrate()` returns the latest envelope.
- [ ] Test `validate()` validates without migration.
- [ ] Test `inspect()` returns metadata without full migration.
- [ ] Test async migrations.
- [ ] Test explicit non-contiguous version IDs.
- [ ] Test duplicate explicit version IDs.
- [ ] Test implicit positional version IDs.
- [ ] Test custom envelope keys.

## 11. Type-Level Tests

- [ ] Test migration input is inferred from the previous schema.
- [ ] Test migration return must satisfy the next schema.
- [ ] Test async migration return must satisfy the next schema.
- [ ] Test `InferLatest<typeof Document>` returns latest payload type.
- [ ] Test `InferVersion<typeof Document, 1>` returns V1 payload type.
- [ ] Test `InferVersion<typeof Document, 2>` returns V2 payload type.
- [ ] Test `InferEnvelope<typeof Document>` returns the union of all supported envelopes.
- [ ] Test explicit and implicit APIs infer equivalent latest payload types.
- [ ] Test invalid migration functions fail compile-time checks.

## 12. Coverage And Quality Gates

- [ ] Require 100% test coverage for statements, branches, functions, and lines.
- [ ] Add coverage enforcement to the test command or CI check script.
- [ ] Ensure `bun run check` runs formatting, linting, type checking, runtime tests, type-level tests, and coverage.
- [ ] Keep generated `dist` output excluded from coverage.
- [ ] Verify package contents with `npm pack --dry-run`.

## 13. Documentation

- [ ] Update `README.md` with the explicit version API.
- [ ] Update `README.md` with the implicit schema API.
- [ ] Document the envelope model.
- [ ] Document each public runtime API.
- [ ] Document typed error codes.
- [ ] Document schema adapter expectations.
- [ ] Add examples for Zod-compatible schemas and custom `.parse` schemas.

## 14. Release Readiness

- [ ] Confirm public exports are complete and stable.
- [ ] Confirm no non-goals were accidentally implemented as first-class scope.
- [ ] Run the full verification suite.
- [ ] Run `npm pack --dry-run` and inspect the package file list.
- [ ] Prepare a first changelog entry for `0.1.0`.
