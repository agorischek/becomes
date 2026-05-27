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

export type InternalVersion = {
  readonly id: VersionId;
  readonly schema: AnySchema;
  readonly migrateFromPrevious?: Migration<unknown, unknown, unknown>;
};

export type InternalHistory = {
  readonly versions: readonly InternalVersion[];
};

type HistoryMode = "explicit" | "implicit";

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

  toInternalHistory(): InternalHistory {
    return {
      versions: this.versions,
    };
  }

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

  private hasVersion(versionId: unknown): boolean {
    return this.versions.some((entry) => Object.is(entry.id, versionId));
  }
}

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

export function getInternalHistory(history: unknown): InternalHistory {
  if (history instanceof HistoryBuilderImpl) {
    return history.toInternalHistory();
  }

  throw new BecomesError("Invalid schema history.", {
    code: "INVALID_HISTORY",
  });
}
