<p align="center">
  <img src="./assets/wordmark.svg" alt="becomes" height="80">
</p>

# becomes

Type-safe schema evolution for long-lived TypeScript documents.

When a document outlives any single version of its schema, you need two things
that stay in sync: the schemas themselves, and the migrations that move data
between them. `becomes` lets you express both as a single typed chain:

```ts
V1 becomes V2 becomes V3
```

Each step carries the next schema together with the migration from the previous
shape, so the schema registry and the migration registry can't drift apart.

## Defining a document

A document is a `type` string, a chain of versions, and an optional factory for
new payloads.

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

Version identifiers are durable protocol artifacts, so you author them
explicitly. They are labels, not array indexes — the chain just needs to be
linear and the ids unique, so `version(10, V1).becomes(20, V2, migrate)` is
perfectly fine.

## The envelope

Your schemas validate payload data. `becomes` owns the persisted envelope that
wraps it:

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

If your storage already uses different field names, pass `envelope.typeKey`,
`envelope.versionKey`, and `envelope.dataKey` to `defineDocument` to match.

## Runtime API

These methods operate on values already in memory. They never touch the file
system or a storage adapter — that's still your code's job.

- **`decode(raw)`** validates an unknown persisted envelope, migrates the
  payload to the latest version, and returns a non-throwing status result. It
  always returns a promise, since migrations may be async.
- **`encode(data)`** validates a latest-version payload and wraps it in the
  latest envelope, also as a non-throwing status result. It returns a promise
  because schema validation may be async.
- **`create(...args)`** runs the configured factory and validates its output.
  Factory parameter types are preserved on the returned method. Its promise
  rejects for invalid factory output, because that's a local programmer contract
  rather than a durable-data condition.
- **`validate(raw)`** checks an envelope and its payload against the declared
  version without running any migrations. It returns a promise.
- **`inspect(raw)`** reads envelope metadata (type and version) without
  validating the payload or running migrations.

Factories can take application-defined arguments, and those types flow through:

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

await BoardDocument.create("Roadmap");
```

### Decode results

`decode` models the ordinary outcomes of reading a durable document as explicit
statuses, so you can branch on them directly:

```ts
const result = await BoardDocument.decode(raw);

if (result.status === "current" || result.status === "migrated") {
  result.value;
  result.envelope;
}

if (result.status === "missing") {
  // raw was null or undefined — nothing has been persisted yet.
}

if (result.status === "unsupported-version" || result.status === "invalid") {
  result.error.code;
}
```

### Encode results

`encode` uses the same style for write-boundary payloads:

```ts
const result = await BoardDocument.encode(board);

if (result.status === "encoded") {
  result.envelope;
}

if (result.status === "invalid") {
  result.error.code;
}
```

## Schemas

`becomes` accepts Standard Schema v1 validators. Libraries such as Zod,
Valibot, and ArkType expose this interface directly through `~standard`, so
their schemas work without package-specific adapters:

```ts
import * as z from "zod";

const BoardSchema = z.object({
  title: z.string(),
  cards: z.array(z.string()),
});

const BoardDocument = defineDocument({
  type: "app.board",
  versions: version(1, BoardSchema),
});
```

Custom validators should expose the same `~standard.validate` contract:

```ts
const TitleSchema = {
  "~standard": {
    version: 1,
    vendor: "app",
    validate(input: unknown) {
      if (
        typeof input === "object" &&
        input !== null &&
        "title" in input &&
        typeof input.title === "string"
      ) {
        return { value: { title: input.title } };
      }

      return { issues: [{ message: "Invalid title." }] };
    },
  },
};
```

`becomes` intentionally does not accept `parse(input)` or `safeParse(input)`
objects as a separate contract. Keeping one schema protocol avoids hidden
precedence rules and keeps validation issues in the Standard Schema shape.

If a validator does not implement Standard Schema, wrap it once at your app
boundary by returning `{ value }` for valid input or `{ issues }` for invalid
input:

```ts
const WrappedTitleSchema = {
  "~standard": {
    version: 1,
    vendor: "app",
    validate(input: unknown) {
      if (
        typeof input === "object" &&
        input !== null &&
        "title" in input &&
        typeof input.title === "string"
      ) {
        return { value: { title: input.title } };
      }

      return { issues: [{ message: "Invalid title." }] };
    },
  },
};
```

## Errors

Public failures surface as `BecomesError`, which carries a stable `code`
alongside the human-readable message:

- `INVALID_ENVELOPE`
- `TYPE_MISMATCH`
- `MISSING_VERSION`
- `UNSUPPORTED_VERSION`
- `INVALID_PAYLOAD`
- `MIGRATION_FAILED`
- `INVALID_MIGRATION_OUTPUT`
- `INVALID_LATEST_PAYLOAD`
- `INVALID_VERSION_CHAIN`

Codes are intended for programmatic handling and are kept stable within a major
version. Messages may improve over time.

## Scripts

This package uses Bun for development:

- `bun run build` — compile TypeScript into `dist`.
- `bun run test` — run the runtime test suite.
- `bun run test:coverage` — run tests and enforce 100% coverage on the emitted
  lcov metrics.
- `bun run typecheck:tests` — type-check the test suite.
- `bun run typecheck:types` — run the compile-time API tests.
- `bun run lint` — run oxlint.
- `bun run format` / `bun run format:check` — format (or check formatting) with
  oxfmt.
- `bun run pack:dry-run` — verify the published npm package contents after a
  build.
- `bun run check` — run the full verification suite (format check, lint, build,
  type-checks, and coverage).

## GitHub automation

CI runs on pull requests and pushes to `main`. It installs with Bun, runs
`bun run check`, and verifies the npm package contents with `bun run
pack:dry-run`.

Releases publish to npm when a GitHub Release is published. The release tag
must match the `package.json` version as `v<version>` (for example, `v0.1.0`).
Set the repository secret `NPM_TOKEN` to an npm automation token with publish
rights; the release workflow publishes with npm provenance enabled.
