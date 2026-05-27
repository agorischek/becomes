# becomes

Type-safe schema evolution for long-lived TypeScript documents.

`becomes` lets application-owned JSON-like documents carry a typed lineage:

```ts
V1 becomes V2 becomes V3
```

Each step includes the next schema and the migration from the previous payload
shape, so the schema registry and migration registry cannot drift apart.

## Install

```sh
bun add becomes
```

## Explicit Versions

Use explicit versions when version identifiers are durable protocol artifacts.

```ts
import { defineDocument, version, type InferLatest } from "becomes";

const BoardDocument = defineDocument({
  type: "tasks.board",
  history: version(1, BoardV1Schema)
    .becomes(2, BoardV2Schema, (v1) => ({
      columns: [],
      cards: Object.fromEntries(v1.cards.map((card) => [card.id, card])),
    }))
    .becomes(3, BoardV3Schema, (v2) => ({
      ...v2,
      archivedCardIds: [],
    })),
  create: () => ({
    columns: [],
    cards: {},
    archivedCardIds: [],
  }),
});

type Board = InferLatest<typeof BoardDocument>;
```

Explicit versions are treated as authored chain labels, not arithmetic indexes.
`version(10, V1).becomes(20, V2, migrate)` is valid.

## Implicit Versions

Use implicit versions for simpler local formats. Versions start at `1` and
increment by position.

```ts
import { defineDocument, schema } from "becomes";

const BoardDocument = defineDocument({
  type: "tasks.board",
  history: schema(BoardV1Schema)
    .becomes(BoardV2Schema, migrateV1ToV2)
    .becomes(BoardV3Schema, migrateV2ToV3),
});
```

The implicit and explicit APIs normalize to the same internal history shape.

## Envelope

User schemas validate the payload only. `becomes` owns the persisted envelope:

```ts
{
  type: "tasks.board",
  version: 3,
  data: {
    columns: [],
    cards: {},
    archivedCardIds: []
  }
}
```

Custom envelope keys are supported with `envelope.typeKey`,
`envelope.versionKey`, and `envelope.dataKey`.

## Runtime API

- `open(raw)` validates an unknown persisted envelope, migrates it to latest,
  and returns the latest payload.
- `save(data)` validates the latest payload and wraps it in an envelope.
- `create()` returns a validated latest payload from the configured factory.
- `migrate(envelope)` migrates to latest and returns the latest envelope.
- `validate(raw)` validates the declared envelope and payload without
  migration.
- `inspect(raw)` reads metadata without validating payload data or running
  migrations.

Async migrations are supported. `open` and `migrate` always return promises.

## Schema Adapter

Any schema-like object with `parse(input): T` works:

```ts
const TitleSchema = {
  parse(input: unknown): { title: string } {
    if (
      typeof input === "object" &&
      input !== null &&
      "title" in input &&
      typeof input.title === "string"
    ) {
      return {
        title: input.title,
      };
    }

    throw new Error("Invalid title.");
  },
};
```

Zod-style parsers work naturally because Zod schemas expose `.parse(input)`.
Schemas with `safeParse(input)` are also supported.

## Errors

Public failures use `BecomesError` with stable `code` values:

- `INVALID_ENVELOPE`
- `TYPE_MISMATCH`
- `MISSING_VERSION`
- `UNSUPPORTED_VERSION`
- `INVALID_PAYLOAD`
- `MIGRATION_FAILED`
- `INVALID_MIGRATION_OUTPUT`
- `INVALID_LATEST_PAYLOAD`
- `CREATE_NOT_DEFINED`
- `INVALID_HISTORY`

## Scripts

- `bun run build` compiles TypeScript into `dist`.
- `bun run test` runs runtime tests.
- `bun run test:coverage` enforces 100% coverage for emitted lcov metrics.
- `bun run typecheck:types` runs compile-time API tests.
- `bun run lint` runs oxlint.
- `bun run format` formats the package with oxfmt.
- `bun run check` runs the full verification suite.
