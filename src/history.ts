import { BecomesError } from "./errors.js";
import { HISTORY_BRAND } from "./types.js";
import type {
  AnySchema,
  ExplicitHistoryBuilder,
  ImplicitHistoryBuilder,
  Migration,
  VersionEntry,
  VersionId,
} from "./types.js";

/**
 * Runtime representation for one version in a normalized linear history.
 *
 * @internal
 */
export type InternalVersion = {
  /** Authored or generated version identifier. */
  readonly id: VersionId;
  /** Runtime schema used to validate this version's payload. */
  readonly schema: AnySchema;
  /** Migration from the immediately previous version, absent on the first entry. */
  readonly migrateFromPrevious?: Migration<unknown, unknown, unknown>;
};

/**
 * Runtime representation shared by explicit and implicit history builders.
 *
 * @internal
 */
export type InternalHistory = {
  /** Versions in authored chain order. */
  readonly versions: readonly InternalVersion[];
};

type HistoryMode = "explicit" | "implicit";

/**
 * Runtime implementation behind both fluent builder APIs.
 *
 * @remarks
 * The public builder types carry precise generics, while this class stores only
 * erased runtime metadata. Each `.becomes` call returns a fresh instance so
 * builder reuse is safe.
 *
 * @internal
 */
class HistoryBuilderImpl {
  readonly [HISTORY_BRAND] = {
    mode: "explicit" as const,
    versions: [] as readonly VersionEntry<VersionId, AnySchema>[],
    context: undefined as unknown,
  };

  readonly mode: HistoryMode;
  readonly versions: readonly InternalVersion[];
  readonly nextImplicitId: number;

  constructor(mode: HistoryMode, versions: readonly InternalVersion[], nextImplicitId: number) {
    this.mode = mode;
    this.versions = Object.freeze(versions.map((entry) => Object.freeze({ ...entry })));
    this.nextImplicitId = nextImplicitId;
  }

  /**
   * Append a new version using the argument shape for the active builder mode.
   */
  becomes(...args: readonly unknown[]): HistoryBuilderImpl {
    if (this.mode === "explicit") {
      const [versionId, nextSchema, migration] = args;

      if (this.hasVersion(versionId)) {
        throw new BecomesError(`Duplicate version id: ${String(versionId)}.`, {
          code: "INVALID_HISTORY",
          version: String(versionId),
        });
      }

      return this.append(versionId as VersionId, nextSchema, migration);
    }

    const [nextSchema, migration] = args;
    return this.append(this.nextImplicitId, nextSchema, migration);
  }

  /**
   * Return the normalized immutable history used by document definitions.
   */
  toInternalHistory(): InternalHistory {
    return {
      versions: this.versions,
    };
  }

  /**
   * Create a new builder with one additional version entry.
   */
  private append(versionId: VersionId, schema: unknown, migration: unknown): HistoryBuilderImpl {
    return new HistoryBuilderImpl(
      this.mode,
      [
        ...this.versions,
        {
          id: versionId,
          schema: schema as AnySchema,
          migrateFromPrevious: migration as Migration<unknown, unknown, unknown>,
        },
      ],
      this.nextImplicitId + 1,
    );
  }

  /**
   * Check duplicate explicit version labels with `Object.is` semantics.
   */
  private hasVersion(versionId: unknown): boolean {
    return this.versions.some((entry) => Object.is(entry.id, versionId));
  }
}

/**
 * Start an explicit versioned schema history.
 *
 * @remarks
 * Use this API when persisted version identifiers are durable external
 * protocol labels. Explicit histories are linear in authored order and do not
 * require numeric contiguity.
 *
 * @example
 * ```ts
 * const history = version(10, V1)
 *   .becomes(20, V2, migrateV1ToV2)
 *   .becomes(30, V3, migrateV2ToV3);
 * ```
 *
 * @param versionId - Stable version identifier for the first schema.
 * @param schema - Schema for the first persisted payload shape.
 * @typeParam TId - Literal type of the first version identifier.
 * @typeParam TSchema - Schema type for the first payload.
 * @typeParam TContext - Migration context type.
 */
export function version<const TId extends VersionId, TSchema extends AnySchema, TContext = unknown>(
  versionId: TId,
  schema: TSchema,
): ExplicitHistoryBuilder<readonly [VersionEntry<TId, TSchema>], TContext> {
  return new HistoryBuilderImpl(
    "explicit",
    [
      {
        id: versionId,
        schema,
      },
    ],
    2,
  ) as unknown as ExplicitHistoryBuilder<readonly [VersionEntry<TId, TSchema>], TContext>;
}

/**
 * Start an implicit positional schema history.
 *
 * @remarks
 * Use this API for local or simple formats where version identifiers do not
 * need to be authored manually. The first schema is version `1`, and each
 * `.becomes` call increments the version by one.
 *
 * @example
 * ```ts
 * const history = schema(V1)
 *   .becomes(V2, migrateV1ToV2)
 *   .becomes(V3, migrateV2ToV3);
 * ```
 *
 * @param schema - Schema for the first persisted payload shape.
 * @typeParam TSchema - Schema type for the first payload.
 * @typeParam TContext - Migration context type.
 */
export function schema<TSchema extends AnySchema, TContext = unknown>(
  schema: TSchema,
): ImplicitHistoryBuilder<readonly [VersionEntry<1, TSchema>], 2, TContext> {
  return new HistoryBuilderImpl(
    "implicit",
    [
      {
        id: 1,
        schema,
      },
    ],
    2,
  ) as unknown as ImplicitHistoryBuilder<readonly [VersionEntry<1, TSchema>], 2, TContext>;
}

/**
 * Extract the normalized runtime history from a public builder.
 *
 * @throws {@link BecomesError} with `INVALID_HISTORY` when the value was not
 * produced by `version` or `schema`.
 *
 * @internal
 */
export function getInternalHistory(history: unknown): InternalHistory {
  if (history instanceof HistoryBuilderImpl) {
    return history.toInternalHistory();
  }

  throw new BecomesError("Invalid schema history.", {
    code: "INVALID_HISTORY",
  });
}
