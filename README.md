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

## Versions

Version identifiers are durable protocol artifacts and must be authored
explicitly.

```ts
import { defineDocument, version, type InferLatest } from "becomes";

const BoardDocument = defineDocument({
  type: "tasks.board",
  versions: version(1, BoardV1Schema)
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

Versions are treated as authored chain labels, not arithmetic indexes.
`version(10, V1).becomes(20, V2, migrate)` is valid.

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

These methods work on values already in memory. They do not read files, write
files, or talk to storage adapters.

- `decode(raw)` validates an unknown persisted envelope, migrates it to latest,
  and returns a non-throwing status result.
- `encode(data)` validates the latest payload and returns a non-throwing status
  result with the latest envelope.
- `create(...args)` returns a validated latest payload from the configured
  factory when one is configured. Factory argument types are preserved, and
  invalid factory output still throws because it is a local programmer contract.
- `validate(raw)` validates the declared envelope and payload without
  migration.
- `inspect(raw)` reads metadata without validating payload data or running
  migrations.

Async migrations are supported. `decode` always returns a promise.

Create factories may accept application-defined arguments:

```ts
const BoardDocument = defineDocument({
  type: "tasks.board",
  versions,
  create: (title: string) => ({
    title,
    columns: [],
    cards: {},
  }),
});

BoardDocument.create("Roadmap");
```

`decode` models ordinary durable-document read states explicitly:

```ts
const result = await BoardDocument.decode(raw);

if (result.status === "current" || result.status === "migrated") {
  result.value;
  result.envelope;
}

if (result.status === "missing") {
  // Nothing has been persisted yet.
}

if (result.status === "unsupported-version" || result.status === "invalid") {
  result.error.code;
}
```

`encode` uses the same explicit status style for write-boundary payloads:

```ts
const result = BoardDocument.encode(board);

if (result.status === "encoded") {
  result.envelope;
}

if (result.status === "invalid") {
  result.error.code;
}
```

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
- `INVALID_VERSION_CHAIN`

## Scripts

- `bun run build` compiles TypeScript into `dist`.
- `bun run test` runs runtime tests.
- `bun run test:coverage` enforces 100% coverage for emitted lcov metrics.
- `bun run typecheck:types` runs compile-time API tests.
- `bun run pack:dry-run` verifies the npm package contents after a build.
- `bun run lint` runs oxlint.
- `bun run format` formats the package with oxfmt.
- `bun run check` runs the full verification suite.

## GitHub Automation

CI runs on pull requests and pushes to `main`. It installs with Bun, runs
`bun run check`, and verifies the npm package contents with `bun run
pack:dry-run`.

Releases publish to npm when a GitHub Release is published. The release tag must
match the package version in `package.json` as `v<version>`, such as `v0.1.0`.

Configure the repository secret `NPM_TOKEN` with an npm automation token that
can publish the package. The release workflow publishes with npm provenance
enabled.
