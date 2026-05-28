import { BecomesError } from "./errors.js";
import { VERSION_CHAIN_BRAND } from "./types.js";
import type {
  AnySchema,
  VersionChainBuilder,
  Migration,
  VersionEntry,
  VersionId,
} from "./types.js";

/**
 * Runtime representation for one version in a normalized linear version chain.
 *
 * @internal
 */
export type InternalVersion = {
  /** Authored version identifier. */
  readonly id: VersionId;
  /** Runtime schema used to validate this version's payload. */
  readonly schema: AnySchema;
  /** Migration from the immediately previous version, absent on the first entry. */
  readonly migrateFromPrevious?: Migration<unknown, unknown, unknown>;
};

/**
 * Runtime representation for the fluent version-chain builder.
 *
 * @internal
 */
export type InternalVersionChain = {
  /** Versions in authored chain order. */
  readonly versions: readonly InternalVersion[];
};

/**
 * Runtime implementation behind the fluent builder API.
 *
 * @remarks
 * The public builder types carry precise generics, while this class stores only
 * erased runtime metadata. Each `.becomes` call returns a fresh instance so
 * builder reuse is safe.
 *
 * @internal
 */
class VersionChainBuilderImpl {
  readonly [VERSION_CHAIN_BRAND] = {
    mode: "explicit" as const,
    versions: [] as readonly VersionEntry<VersionId, AnySchema>[],
    context: undefined as unknown,
  };

  readonly versions: readonly InternalVersion[];

  constructor(versions: readonly InternalVersion[]) {
    this.versions = Object.freeze(versions.map((entry) => Object.freeze({ ...entry })));
  }

  /**
   * Append a new authored version.
   */
  becomes(...args: readonly unknown[]): VersionChainBuilderImpl {
    const [versionId, nextSchema, migration] = args;

    if (this.hasVersion(versionId)) {
      throw new BecomesError(`Duplicate version id: ${String(versionId)}.`, {
        code: "INVALID_VERSION_CHAIN",
        version: String(versionId),
      });
    }

    return this.append(versionId as VersionId, nextSchema, migration);
  }

  /**
   * Return the normalized immutable version chain used by document definitions.
   */
  toInternalVersionChain(): InternalVersionChain {
    return {
      versions: this.versions,
    };
  }

  /**
   * Create a new builder with one additional version entry.
   */
  private append(
    versionId: VersionId,
    schema: unknown,
    migration: unknown,
  ): VersionChainBuilderImpl {
    return new VersionChainBuilderImpl([
      ...this.versions,
      {
        id: versionId,
        schema: schema as AnySchema,
        migrateFromPrevious: migration as Migration<unknown, unknown, unknown>,
      },
    ]);
  }

  /**
   * Check duplicate explicit version labels with `Object.is` semantics.
   */
  private hasVersion(versionId: unknown): boolean {
    return this.versions.some((entry) => Object.is(entry.id, versionId));
  }
}

/**
 * Start an explicit versioned schema chain.
 *
 * @remarks
 * Use this API when persisted version identifiers are durable external
 * protocol labels. Explicit version chains are linear in authored order and do not
 * require numeric contiguity.
 *
 * @example
 * ```ts
 * const versions = version(10, V1)
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
): VersionChainBuilder<readonly [VersionEntry<TId, TSchema>], TContext> {
  return new VersionChainBuilderImpl([
    {
      id: versionId,
      schema,
    },
  ]) as unknown as VersionChainBuilder<readonly [VersionEntry<TId, TSchema>], TContext>;
}

/**
 * Extract the normalized runtime version chain from a public builder.
 *
 * @throws {@link BecomesError} with `INVALID_VERSION_CHAIN` when the value was
 * not produced by {@link version}.
 *
 * @internal
 */
export function getInternalVersionChain(versions: unknown): InternalVersionChain {
  if (versions instanceof VersionChainBuilderImpl) {
    return versions.toInternalVersionChain();
  }

  throw new BecomesError("Invalid version chain.", {
    code: "INVALID_VERSION_CHAIN",
  });
}
