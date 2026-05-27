# Implementation Plan

## 1. Project Baseline

- [x] Confirm package entrypoint exports match the public API named in `SPEC.md`.
- [x] Add a test runner and coverage tooling for Bun/TypeScript.
- [x] Add type-level test tooling (`tsd`, `expect-type`, or equivalent).
- [x] Add scripts for unit tests, type tests, coverage, and full CI checks.
- [x] Keep `bun run check` as the main verification command.

## 2. Core Types

- [x] Define `Schema<T>` / `StandardSchema<T>` support for schema-like objects with `parse(input): T`.
- [x] Add optional support for schema-like objects with `safeParse(input)`.
- [x] Implement `InferSchema<TSchema>`.
- [x] Define `VersionId` as `number` initially, with type structure that can later expand to `string | number`.
- [x] Define `Migration<From, To, Context = unknown>`.
- [x] Define internal `VersionEntry` and normalized `InternalHistory` shapes.
- [x] Define public inference helpers:
  - [x] `InferLatest<TDocument>`
  - [x] `InferVersion<TDocument, TVersion>`
  - [x] `InferEnvelope<TDocument>`

## 3. Error Model

- [x] Implement `BecomesErrorCode`.
- [x] Implement `BecomesError` with stable `code`, optional `documentType`, optional `version`, and optional `cause`.
- [x] Add helpers for consistently wrapping validation and migration failures.
- [x] Ensure all public APIs return or throw typed errors using the codes from `SPEC.md`.

## 4. Schema Adapter Runtime

- [x] Implement `parseWithSchema(schema, input)` for `.parse(input)`.
- [x] Normalize parser failures into `BecomesError`.
- [x] Add `.safeParse(input)` support if practical without compromising the minimal adapter model.
- [x] Ensure parsed return values preserve inferred TypeScript payload types.

## 5. Explicit History API

- [x] Implement `version(versionId, schema)`.
- [x] Implement immutable `.becomes(nextVersionId, nextSchema, migration)` chaining.
- [x] Preserve authored explicit version IDs exactly.
- [x] Reject duplicate explicit version IDs at document-definition time or earlier.
- [x] Treat explicit histories as linear authored chains rather than contiguous numeric ranges.
- [x] Enforce migration input type as the previous schema payload.
- [x] Enforce migration return type as the next schema payload or `Promise` of that payload.

## 6. Implicit History API

- [x] Implement `schema(schema)`.
- [x] Implement immutable `.becomes(nextSchema, migration)` chaining.
- [x] Generate positional version IDs starting at `1`.
- [x] Increment implicit version IDs by `1` for each `.becomes`.
- [x] Normalize implicit histories to the same internal representation as explicit histories.
- [x] Verify implicit and explicit APIs infer equivalent latest payload types.

## 7. Document Definition

- [x] Implement `defineDocument(options)`.
- [x] Support required `type` and `history` options.
- [x] Support optional `create`.
- [x] Support optional `context`.
- [x] Support optional `envelope` key overrides:
  - [x] `typeKey`, defaulting to `"type"`
  - [x] `versionKey`, defaulting to `"version"`
  - [x] `dataKey`, defaulting to `"data"`
- [x] Support `validateBeforeMigration`, defaulting to `true`.
- [x] Support `validateAfterMigration`, defaulting to `true`.
- [x] Expose typed runtime metadata:
  - [x] `type`
  - [x] `latestVersion`
  - [x] known versions/history as needed internally

## 8. Document Runtime APIs

- [x] Implement `open(raw, options?)`.
- [x] Parse unknown raw input as an envelope.
- [x] Verify document type.
- [x] Verify version presence.
- [x] Reject unsupported versions.
- [x] Validate payload against the declared version schema before migration.
- [x] Apply each migration step in authored order until latest.
- [x] Support async migrations.
- [x] Validate migration output after each step when enabled.
- [x] Return latest payload only.
- [x] Implement `save(data)`.
- [x] Validate latest payload before saving unless disabled by API design.
- [x] Return latest-version envelope.
- [x] Implement `create()`.
- [x] Require the `create` option to exist before use.
- [x] Return latest payload type.
- [x] Implement `migrate(envelope, options?)`.
- [x] Return latest-version envelope instead of payload.
- [x] Implement `validate(raw)`.
- [x] Validate envelope and declared-version payload without migrating.
- [x] Implement `inspect(raw)`.
- [x] Return document metadata without running migrations when possible.

## 9. Envelope Support

- [x] Implement default envelope shape `{ type, version, data }`.
- [x] Implement `InferEnvelope<TDocument>` as a union of every supported persisted envelope.
- [x] Keep user schemas scoped to payload data only.
- [x] Ensure envelope parsing handles non-object values as `INVALID_ENVELOPE`.
- [x] Ensure custom envelope keys work consistently across `open`, `save`, `migrate`, `validate`, and `inspect`.

## 10. Runtime Tests

- [x] Test opening a latest-version document without migration.
- [x] Test opening an older document and migrating to latest.
- [x] Test validation before migration.
- [x] Test validation after each migration.
- [x] Test rejecting a missing or malformed envelope.
- [x] Test rejecting the wrong document type.
- [x] Test rejecting a missing version.
- [x] Test rejecting an unknown version.
- [x] Test rejecting an invalid payload.
- [x] Test wrapping thrown migration errors as `MIGRATION_FAILED`.
- [x] Test rejecting invalid migration output as `INVALID_MIGRATION_OUTPUT`.
- [x] Test saving latest payload with the correct envelope.
- [x] Test `create()` returns the latest payload.
- [x] Test `migrate()` returns the latest envelope.
- [x] Test `validate()` validates without migration.
- [x] Test `inspect()` returns metadata without full migration.
- [x] Test async migrations.
- [x] Test explicit non-contiguous version IDs.
- [x] Test duplicate explicit version IDs.
- [x] Test implicit positional version IDs.
- [x] Test custom envelope keys.

## 11. Type-Level Tests

- [x] Test migration input is inferred from the previous schema.
- [x] Test migration return must satisfy the next schema.
- [x] Test async migration return must satisfy the next schema.
- [x] Test `InferLatest<typeof Document>` returns latest payload type.
- [x] Test `InferVersion<typeof Document, 1>` returns V1 payload type.
- [x] Test `InferVersion<typeof Document, 2>` returns V2 payload type.
- [x] Test `InferEnvelope<typeof Document>` returns the union of all supported envelopes.
- [x] Test explicit and implicit APIs infer equivalent latest payload types.
- [x] Test invalid migration functions fail compile-time checks.

## 12. Coverage And Quality Gates

- [x] Require 100% test coverage for statements, branches, functions, and lines.
- [x] Add coverage enforcement to the test command or CI check script.
- [x] Ensure `bun run check` runs formatting, linting, type checking, runtime tests, type-level tests, and coverage.
- [x] Keep generated `dist` output excluded from coverage.
- [x] Verify package contents with `npm pack --dry-run`.

## 13. Documentation

- [x] Update `README.md` with the explicit version API.
- [x] Update `README.md` with the implicit schema API.
- [x] Document the envelope model.
- [x] Document each public runtime API.
- [x] Document typed error codes.
- [x] Document schema adapter expectations.
- [x] Add examples for Zod-compatible schemas and custom `.parse` schemas.

## 14. Release Readiness

- [x] Confirm public exports are complete and stable.
- [x] Confirm no non-goals were accidentally implemented as first-class scope.
- [x] Run the full verification suite.
- [x] Run `npm pack --dry-run` and inspect the package file list.
- [x] Prepare a first changelog entry for `0.1.0`.
