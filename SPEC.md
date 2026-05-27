# becomes — Type-Safe Schema Evolution for Long-Lived Documents

## Purpose

`becomes` is a TypeScript library for defining, validating, loading, and migrating long-lived external documents whose persisted schema evolves over time.

The library is intended for application-owned document/state formats such as:

- collaborative workspaces
- local-first app documents
- exported/imported JSON files
- IndexedDB/localStorage persisted state
- save-game-like durable state
- long-lived user data models

The central idea is that a persisted document schema does not merely have migrations; it has a typed lineage:

  V1 becomes V2 becomes V3 ...

The library should make invalid schema histories difficult or impossible to express, and should prove migration compatibility at TypeScript compile time.

## Package Name

Package name: `becomes`

Primary exports:

    import {
      schema,
      version,
      defineDocument,
      type InferLatest,
      type InferVersion,
      type InferEnvelope,
      type Migration,
    } from "becomes";

## Core Design

The library supports two authoring APIs.

### 1. Explicit version API

For long-lived external document formats where version identifiers are durable protocol artifacts.

    const BoardDocument = defineDocument({
      type: "tasks.board",
      history: version(1, BoardV1Schema)
        .becomes(2, BoardV2Schema, migrateV1ToV2)
        .becomes(3, BoardV3Schema, migrateV2ToV3),
      create: createDefaultBoard,
    });

This API is the recommended default for external documents.

### 2. Implicit version API

For simpler/local use cases where versions are derived from position.

    const BoardDocument = defineDocument({
      type: "tasks.board",
      history: schema(BoardV1Schema)
        .becomes(BoardV2Schema, migrateV1ToV2)
        .becomes(BoardV3Schema, migrateV2ToV3),
      create: createDefaultBoard,
    });

This should internally desugar to explicit versions:

    1 -> BoardV1Schema
    2 -> BoardV2Schema
    3 -> BoardV3Schema

The implicit and explicit APIs should normalize to the same internal representation.

## Non-Goals

This library is not:

- a SQL migration framework
- an ORM
- a database schema migration tool
- a CRDT implementation
- a persistence adapter
- a state management library
- a runtime validation library by itself

It should integrate with validation libraries such as Zod, Valibot, TypeBox, ArkType, or custom schema adapters.

## Terminology

### Schema

A runtime validator/parser for a persisted payload shape.

Example:

    const BoardV1Schema = z.object({
      cards: z.array(z.object({
        id: z.string(),
        title: z.string(),
      })),
    });

The schema describes only the payload, not the persistence envelope.

### Version

A stable identifier for a persisted document shape.

In explicit mode, versions are user-authored:

    version(1, V1Schema)
      .becomes(2, V2Schema, migrate)

In implicit mode, versions are positional:

    schema(V1Schema)
      .becomes(V2Schema, migrate)

means:

    1 -> V1Schema
    2 -> V2Schema

### Migration

A function that transforms a valid payload of the previous version into a valid payload of the next version.

    type Migration<From, To, Context = unknown> =
      (from: From, context: Context) => To | Promise<To>;

Migrations operate on persisted payloads, not runtime objects.

### Envelope

The framework-level persisted wrapper around the document payload.

Default envelope shape:

    type PersistedEnvelope<TType extends string, TVersion, TPayload> = {
      type: TType;
      version: TVersion;
      data: TPayload;
    };

Example:

    {
      "type": "tasks.board",
      "version": 2,
      "data": {
        "columns": [],
        "cards": []
      }
    }

The envelope is owned by `becomes`.

User schemas validate `data`, not the envelope.

### Document Definition

The runtime object returned by `defineDocument`.

It is the compiled artifact produced by the schema history.

It should expose APIs such as:

    BoardDocument.open(raw)
    BoardDocument.save(latest)
    BoardDocument.create()
    BoardDocument.migrate(envelope)
    BoardDocument.validate(raw)
    BoardDocument.inspect(raw)

## Primary API

### `version(versionId, schema)`

Starts an explicit versioned schema history.

    const history = version(1, V1Schema)
      .becomes(2, V2Schema, migrateV1ToV2)
      .becomes(3, V3Schema, migrateV2ToV3);

Requirements:

- `versionId` may initially support `number`.
- Future-compatible design should allow `string | number`.
- Explicit histories must preserve authored version IDs exactly.
- Duplicate version IDs are invalid.
- In the initial implementation, explicit histories should be linear.
- Migration source is always the immediately previous schema.
- Migration target is the schema passed to `.becomes`.

Compile-time goals:

    version(1, V1)
      .becomes(2, V2, (v1) => {
        // v1 is inferred as Infer<typeof V1>
        return ... // must satisfy Infer<typeof V2>
      });

### `schema(schema)`

Starts an implicit schema history.

    const history = schema(V1Schema)
      .becomes(V2Schema, migrateV1ToV2)
      .becomes(V3Schema, migrateV2ToV3);

Requirements:

- Version IDs are generated positionally.
- The first schema is version `1`.
- Each `.becomes` increments by 1.
- The normalized internal history should be equivalent to the explicit version API.

Compile-time goals are the same as the explicit API.

### `.becomes(...)`

Adds the next schema in the history.

Explicit mode:

    .becomes(nextVersionId, nextSchema, migration)

Implicit mode:

    .becomes(nextSchema, migration)

The word `becomes` is intentionally used because it describes a durable document changing form while preserving identity.

The method must enforce that the migration accepts the previous payload type and returns the next payload type.

Example:

    const history = version(1, V1Schema)
      .becomes(2, V2Schema, (old) => {
        // old is V1
        return {
          // must be V2
        };
      });

Async migrations should be supported:

    .becomes(2, V2Schema, async (old, ctx) => {
      const value = await ctx.lookup(...);
      return ...
    });

If any migration is async, `open`/`migrate` should return a Promise or the library should provide separate sync/async APIs. Prefer always returning `Promise` from `open` for simplicity unless a strong sync mode is desired.

## `defineDocument`

Defines a durable document type.

    const BoardDocument = defineDocument({
      type: "tasks.board",
      history: version(1, BoardV1Schema)
        .becomes(2, BoardV2Schema, migrateV1ToV2)
        .becomes(3, BoardV3Schema, migrateV2ToV3),
      create: createDefaultBoard,
    });

Options:

    type DefineDocumentOptions<THistory, TType extends string, TContext> = {
      type: TType;
      history: THistory;

      create?: () => LatestPayload<THistory>;

      context?: TContext;

      envelope?: {
        typeKey?: string;     // default "type"
        versionKey?: string;  // default "version"
        dataKey?: string;     // default "data"
      };

      validateAfterMigration?: boolean;  // default true
      validateBeforeMigration?: boolean; // default true
    };

The returned document object should be typed by:

- document type string
- known version IDs
- latest version ID
- latest payload type
- supported envelope union

Example conceptual return type:

    type DocumentDefinition = {
      readonly type: "tasks.board";
      readonly latestVersion: 3;

      create(): BoardV3;

      open(raw: unknown, options?: OpenOptions): Promise<BoardV3>;

      save(data: BoardV3): PersistedEnvelope<"tasks.board", 3, BoardV3>;

      migrate(
        envelope: PersistedEnvelope<"tasks.board", KnownVersion, unknown>,
        options?: MigrateOptions
      ): Promise<PersistedEnvelope<"tasks.board", 3, BoardV3>>;

      validate(raw: unknown): ValidationResult;

      inspect(raw: unknown): InspectionResult;
    };

## Runtime Behavior

### `open(raw)`

Primary loading API.

    const board = await BoardDocument.open(raw);

Pipeline:

1. Treat `raw` as unknown/untrusted.
2. Parse envelope.
3. Verify document `type`.
4. Read embedded `version`.
5. Ensure version is supported.
6. Validate `data` against the schema for that version.
7. Apply each migration step until latest version.
8. Optionally validate after each migration.
9. Return latest payload.

Important:

The caller should not separately provide the version they believe the data has.

Bad:

    BoardDocument.open(raw, { version: 2 });

Good:

    BoardDocument.open(raw);

The persisted envelope itself must carry version metadata.

### `save(data)`

Wraps latest payload in the document envelope.

    const envelope = BoardDocument.save(board);

Returns:

    {
      type: "tasks.board",
      version: 3,
      data: board
    }

Should validate `data` against latest schema before saving unless disabled.

### `create()`

Returns a new latest-version payload.

    const board = BoardDocument.create();

Requires the `create` option to be provided.

Should return the latest payload type.

### `migrate(envelope)`

Migrates a parsed or already-envelope-shaped document to latest.

    const latestEnvelope = await BoardDocument.migrate(envelope);

Unlike `open`, this returns an envelope, not just the payload.

Useful for rewriting stored documents after load.

### `inspect(raw)`

Reads metadata without fully opening if possible.

    const info = BoardDocument.inspect(raw);

Possible return shape:

    type InspectionResult =
      | {
          ok: true;
          type: string;
          version: string | number;
          supported: boolean;
          latest: boolean;
        }
      | {
          ok: false;
          error: BecomesError;
        };

### `validate(raw)`

Validates the envelope and payload for its declared version, but does not migrate.

    const result = BoardDocument.validate(raw);

## Error Model

Use typed errors with stable codes.

    type BecomesErrorCode =
      | "INVALID_ENVELOPE"
      | "TYPE_MISMATCH"
      | "MISSING_VERSION"
      | "UNSUPPORTED_VERSION"
      | "INVALID_PAYLOAD"
      | "MIGRATION_FAILED"
      | "INVALID_MIGRATION_OUTPUT"
      | "INVALID_LATEST_PAYLOAD";

Base error:

    class BecomesError extends Error {
      code: BecomesErrorCode;
      documentType?: string;
      version?: string | number;
      cause?: unknown;
    }

Examples:

- raw value is not an object -> `INVALID_ENVELOPE`
- type is `"notes.doc"` but expected `"tasks.board"` -> `TYPE_MISMATCH`
- no version field -> `MISSING_VERSION`
- version `99` is not known -> `UNSUPPORTED_VERSION`
- V1 schema parse fails -> `INVALID_PAYLOAD`
- migration throws -> `MIGRATION_FAILED`
- migration returns something that fails V2 schema -> `INVALID_MIGRATION_OUTPUT`

## Schema Adapter Model

The library should not hard-depend on Zod only.

Support any schema-like object via a minimal adapter.

Required behavior:

    type StandardSchema<T> = {
      parse(input: unknown): T;
    };

Or support the emerging Standard Schema interface if practical.

Initial pragmatic support:

- any object with `.parse(input): T`
- optionally `.safeParse(input)`

Utility type:

    type InferSchema<TSchema> =
      TSchema extends { parse(input: unknown): infer T } ? T :
      never;

This makes Zod work naturally.

Example:

    const V1 = z.object({ title: z.string() });

    type V1 = InferSchema<typeof V1>;

## Type-Level Requirements

### Migration input inference

Given:

    const history = version(1, V1)
      .becomes(2, V2, migration);

`migration` must be typed as:

    (value: InferSchema<typeof V1>, context: Context) =>
      InferSchema<typeof V2> | Promise<InferSchema<typeof V2>>;

### Migration output checking

This should fail:

    version(1, V1)
      .becomes(2, V2, (old) => {
        return {
          wrong: true
        };
      });

if that return value does not satisfy the inferred V2 type.

### Latest type inference

    type Board = InferLatest<typeof BoardDocument>;

Should infer the latest payload type.

For the example:

    type Board = BoardV3;

### Specific version inference

    type BoardV2 = InferVersion<typeof BoardDocument, 2>;

Should infer the V2 payload type.

### Envelope inference

    type BoardEnvelope = InferEnvelope<typeof BoardDocument>;

Should infer a union of supported persisted envelopes:

    | { type: "tasks.board"; version: 1; data: BoardV1 }
    | { type: "tasks.board"; version: 2; data: BoardV2 }
    | { type: "tasks.board"; version: 3; data: BoardV3 }

For most public APIs, raw input remains `unknown`, but the inferred envelope union is useful for tests and advanced integrations.

## Internal Representation

Both authoring APIs should normalize to an internal linear history:

    type InternalHistory = {
      versions: Array<{
        id: string | number;
        schema: AnySchema;
        migrateFromPrevious?: Migration<any, any, any>;
      }>;
    };

Example explicit API:

    version(1, V1)
      .becomes(2, V2, m12)
      .becomes(3, V3, m23)

normalizes to:

    [
      { id: 1, schema: V1 },
      { id: 2, schema: V2, migrateFromPrevious: m12 },
      { id: 3, schema: V3, migrateFromPrevious: m23 }
    ]

Example implicit API:

    schema(V1)
      .becomes(V2, m12)
      .becomes(V3, m23)

normalizes to the same structure with ids `1`, `2`, `3`.

## Version ID Policy

Initial version:

- Support numeric versions.
- Explicit API requires unique version IDs.
- Explicit API should preserve IDs exactly.
- Implicit API auto-generates positive integers starting at 1.

Potential future version:

- Support string IDs such as `"2025-01"` or `"v3"`.
- Support custom ordering only if explicitly designed.
- Do not add branching until the linear API is stable.

For now, even explicit IDs are treated as a linear authored sequence, not as a sortable numeric range.

This means this is valid:

    version(10, V1)
      .becomes(20, V2, migrate)

The migration path is based on chain order, not arithmetic adjacency.

The library should not require explicit versions to be contiguous.

Rationale:

For long-lived external documents, version identifiers are protocol labels, not array indexes.

## Example

    import { z } from "zod";
    import { defineDocument, version, type InferLatest } from "becomes";

    const BoardV1Schema = z.object({
      cards: z.array(z.object({
        id: z.string(),
        title: z.string(),
      })),
    });

    const BoardV2Schema = z.object({
      columns: z.array(z.object({
        id: z.string(),
        title: z.string(),
        cardIds: z.array(z.string()),
      })),
      cards: z.record(z.object({
        id: z.string(),
        title: z.string(),
      })),
    });

    const BoardV3Schema = z.object({
      columns: z.array(z.object({
        id: z.string(),
        title: z.string(),
        cardIds: z.array(z.string()),
      })),
      cards: z.record(z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().optional(),
      })),
      archivedCardIds: z.array(z.string()),
    });

    const migrateV1ToV2 = (v1: z.infer<typeof BoardV1Schema>) => {
      const defaultColumnId = "default";

      return {
        columns: [
          {
            id: defaultColumnId,
            title: "Default",
            cardIds: v1.cards.map(card => card.id),
          },
        ],
        cards: Object.fromEntries(
          v1.cards.map(card => [card.id, card])
        ),
      };
    };

    const migrateV2ToV3 = (v2: z.infer<typeof BoardV2Schema>) => {
      return {
        ...v2,
        archivedCardIds: [],
      };
    };

    export const BoardDocument = defineDocument({
      type: "tasks.board",
      history: version(1, BoardV1Schema)
        .becomes(2, BoardV2Schema, migrateV1ToV2)
        .becomes(3, BoardV3Schema, migrateV2ToV3),
      create: () => ({
        columns: [],
        cards: {},
        archivedCardIds: [],
      }),
    });

    export type Board = InferLatest<typeof BoardDocument>;

Usage:

    const raw = JSON.parse(await fs.readFile("board.json", "utf8"));

    const board = await BoardDocument.open(raw);

    // board is typed as BoardV3
    board.archivedCardIds;

Saving:

    const envelope = BoardDocument.save(board);

    await fs.writeFile("board.json", JSON.stringify(envelope, null, 2));

Envelope:

    {
      "type": "tasks.board",
      "version": 3,
      "data": {
        "columns": [],
        "cards": {},
        "archivedCardIds": []
      }
    }

## API Naming Decisions

Use:

    version(1, V1Schema)
      .becomes(2, V2Schema, migrate)

and:

    schema(V1Schema)
      .becomes(V2Schema, migrate)

Do not use:

- `.next`
- `.upgrade`
- `.migrate`
- `.to`

Rationale:

- `next` is structural but semantically thin.
- `upgrade` implies improvement and can be misleading.
- `migrate` sounds DB/infrastructure-specific.
- `to` is too generic.
- `becomes` captures transformation, continuity, and durable identity.

The document is still the same document as it changes shape.

## Compile-Time Safety Goals

The original unsafe API looked like this:

    defineSharedState({
      namespace: "tasks.board",
      currentVersion: 3,
      versions: {
        1: BoardV1Schema,
        3: BoardV3Schema,
      },
      migrations: {
        1: migrateV1ToV2,
        2: migrateV2ToV3,
      },
    });

Problem:

Version 2 can be accidentally omitted, producing a runtime failure.

`becomes` avoids this by replacing independent maps with a construction API.

The user cannot say “V1 becomes V3 through a V2 migration” unless they actually construct the intermediate step.

The migration chain is built structurally.

Each `.becomes` call simultaneously supplies:

- next version ID, in explicit mode
- next schema
- migration from previous schema to next schema

This prevents drift between:

- current version
- schema registry
- migration registry

## Testing Requirements

Add tests for:

### Runtime

- opens latest-version document without migration
- opens older document and migrates to latest
- validates payload before migration
- validates payload after each migration
- rejects missing envelope
- rejects wrong document type
- rejects missing version
- rejects unknown version
- rejects invalid payload
- wraps thrown migration errors
- rejects invalid migration output
- saves latest payload with correct envelope
- inspect returns metadata without full migration

### Type-level

Use `tsd`, `expect-type`, or Vitest type tests.

Test:

- migration input is inferred from previous schema
- migration return must satisfy next schema
- `InferLatest` returns latest payload type
- `InferVersion<Document, 1>` returns V1 payload type
- `InferVersion<Document, 2>` returns V2 payload type
- `InferEnvelope` returns union of all envelopes
- explicit and implicit APIs infer equivalent latest types
- invalid migration functions fail compile-time checks

## Implementation Notes

Likely implementation structure:

    src/
      index.ts
      schema.ts
      version.ts
      history.ts
      document.ts
      errors.ts
      types.ts

### Builder object

The chain builder may store runtime metadata in a private property while carrying type state through generics.

Conceptual type:

    type HistoryBuilder<
      TVersions extends readonly VersionEntry<any, any>[],
      TContext
    > = {
      becomes: ...;
      readonly _versions: TVersions;
      readonly _context?: TContext;
    };

Runtime object can be simple:

    class HistoryBuilderImpl {
      constructor(private entries: InternalVersion[]) {}

      becomes(...args: unknown[]) {
        return new HistoryBuilderImpl([...this.entries, nextEntry]);
      }
    }

The public type should make it appear strongly typed even if runtime implementation is straightforward.

### Avoid mutation

Prefer immutable chain construction.

Each `.becomes` should return a new builder.

This makes reuse safe:

    const base = version(1, V1);

    const A = base.becomes(2, VA, migrateA);
    const B = base.becomes(2, VB, migrateB);

### Runtime parser abstraction

Implement:

    function parseWithSchema<T>(schema: Schema<T>, input: unknown): T

Support:

- `schema.parse(input)`
- possibly `schema.safeParse(input)`

Normalize failures into `BecomesError`.

## Future Extensions

Do not implement initially unless easy, but design should not block:

- custom envelope shapes
- string version IDs
- async migration context
- migration telemetry hooks
- dry-run migration
- migration reports
- repair mode
- downgrade/export-to-version
- branching histories
- beta/experimental versions
- document registry that can open many document types
- integration helpers for IndexedDB/localStorage/filesystem
- Standard Schema support

## Design Principle

Make impossible states unrepresentable.

The user should not maintain separate structures for:

- version registry
- migration registry
- current version

Instead, the schema lineage itself is the source of truth.

A document does not have disconnected versions and migrations.

A document has a history of becoming.