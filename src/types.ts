import type { BecomesError } from "./errors.js";

export const HISTORY_BRAND: unique symbol = Symbol("becomes.history");
export const DOCUMENT_BRAND: unique symbol = Symbol("becomes.document");

export type VersionId = number;

export type ParseSchema<T> = {
  parse(input: unknown): T;
};

export type SafeParseSuccess<T> = {
  success: true;
  data: T;
};

export type SafeParseFailure = {
  success: false;
  error?: unknown;
  issues?: unknown;
};

export type SafeParseSchema<T> = {
  safeParse(input: unknown): SafeParseSuccess<T> | SafeParseFailure;
};

export type StandardSchema<T> = ParseSchema<T> | SafeParseSchema<T>;
export type Schema<T> = StandardSchema<T>;
export type AnySchema = StandardSchema<unknown>;

export type InferSchema<TSchema> = TSchema extends {
  parse(input: unknown): infer T;
}
  ? T
  : TSchema extends {
        safeParse(input: unknown): infer TResult;
      }
    ? TResult extends SafeParseSuccess<infer T>
      ? T
      : never
    : never;

export type Migration<From, To, Context = unknown> = (
  from: From,
  context: Context,
) => To | Promise<To>;

export type VersionEntry<TId extends VersionId, TSchema extends AnySchema> = {
  readonly id: TId;
  readonly schema: TSchema;
};

export type AnyVersionEntry = VersionEntry<VersionId, AnySchema>;

export type LatestEntry<TVersions extends readonly AnyVersionEntry[]> = TVersions extends readonly [
  ...(readonly AnyVersionEntry[]),
  infer TLast,
]
  ? TLast extends AnyVersionEntry
    ? TLast
    : never
  : never;

export type LatestVersion<TVersions extends readonly AnyVersionEntry[]> =
  LatestEntry<TVersions>["id"];

export type LatestPayload<TVersions extends readonly AnyVersionEntry[]> = InferSchema<
  LatestEntry<TVersions>["schema"]
>;

export type KnownVersion<TVersions extends readonly AnyVersionEntry[]> = TVersions[number]["id"];

export type PayloadForVersion<
  TVersions extends readonly AnyVersionEntry[],
  TVersion extends VersionId,
> =
  Extract<TVersions[number], { readonly id: TVersion }> extends infer TEntry
    ? TEntry extends AnyVersionEntry
      ? InferSchema<TEntry["schema"]>
      : never
    : never;

export type PersistedEnvelope<TType extends string, TVersion extends VersionId, TPayload> = {
  type: TType;
  version: TVersion;
  data: TPayload;
};

export type EnvelopeOptions = {
  readonly typeKey?: string;
  readonly versionKey?: string;
  readonly dataKey?: string;
};

export type EnvelopeKeyConfig = {
  readonly typeKey: string;
  readonly versionKey: string;
  readonly dataKey: string;
};

export type DefaultEnvelopeKeys = {
  readonly typeKey: "type";
  readonly versionKey: "version";
  readonly dataKey: "data";
};

export type NormalizeEnvelopeKeys<TEnvelope> = {
  readonly typeKey: TEnvelope extends { readonly typeKey: infer TKey extends string }
    ? TKey
    : "type";
  readonly versionKey: TEnvelope extends {
    readonly versionKey: infer TKey extends string;
  }
    ? TKey
    : "version";
  readonly dataKey: TEnvelope extends { readonly dataKey: infer TKey extends string }
    ? TKey
    : "data";
};

export type EnvelopeForKeys<
  TKeys extends EnvelopeKeyConfig,
  TType extends string,
  TVersion extends VersionId,
  TPayload,
> = TKeys extends DefaultEnvelopeKeys
  ? PersistedEnvelope<TType, TVersion, TPayload>
  : {
      [TKey in TKeys["typeKey"]]: TType;
    } & {
      [TKey in TKeys["versionKey"]]: TVersion;
    } & {
      [TKey in TKeys["dataKey"]]: TPayload;
    };

export type EnvelopeUnion<
  TType extends string,
  TVersions extends readonly AnyVersionEntry[],
  TKeys extends EnvelopeKeyConfig,
> = TVersions[number] extends infer TEntry
  ? TEntry extends AnyVersionEntry
    ? EnvelopeForKeys<TKeys, TType, TEntry["id"], InferSchema<TEntry["schema"]>>
    : never
  : never;

type BuildTuple<
  TLength extends number,
  TItems extends unknown[] = [],
> = TItems["length"] extends TLength ? TItems : BuildTuple<TLength, [...TItems, unknown]>;

export type Increment<TValue extends number> = [...BuildTuple<TValue>, unknown]["length"] & number;

export interface ExplicitHistoryBuilder<
  TVersions extends readonly AnyVersionEntry[],
  TContext = unknown,
> {
  readonly [HISTORY_BRAND]: {
    readonly mode: "explicit";
    readonly versions: TVersions;
    readonly context: TContext;
  };

  becomes<const TNextId extends VersionId, TNextSchema extends AnySchema>(
    versionId: TNextId,
    schema: TNextSchema,
    migration: Migration<LatestPayload<TVersions>, InferSchema<TNextSchema>, TContext>,
  ): ExplicitHistoryBuilder<readonly [...TVersions, VersionEntry<TNextId, TNextSchema>], TContext>;
}

export interface ImplicitHistoryBuilder<
  TVersions extends readonly AnyVersionEntry[],
  TNextId extends number,
  TContext = unknown,
> {
  readonly [HISTORY_BRAND]: {
    readonly mode: "implicit";
    readonly versions: TVersions;
    readonly context: TContext;
  };

  becomes<TNextSchema extends AnySchema>(
    schema: TNextSchema,
    migration: Migration<LatestPayload<TVersions>, InferSchema<TNextSchema>, TContext>,
  ): ImplicitHistoryBuilder<
    readonly [...TVersions, VersionEntry<TNextId, TNextSchema>],
    Increment<TNextId>,
    TContext
  >;
}

export type AnyHistoryBuilder =
  | ExplicitHistoryBuilder<readonly AnyVersionEntry[], unknown>
  | ImplicitHistoryBuilder<readonly AnyVersionEntry[], number, unknown>;

export type HistoryVersions<THistory> = THistory extends {
  readonly [HISTORY_BRAND]: {
    readonly versions: infer TVersions extends readonly AnyVersionEntry[];
  };
}
  ? TVersions
  : never;

export type HistoryContext<THistory> = THistory extends {
  readonly [HISTORY_BRAND]: {
    readonly context: infer TContext;
  };
}
  ? TContext
  : unknown;

export type OpenOptions<TContext = unknown> = {
  readonly context?: TContext;
  readonly validateBeforeMigration?: boolean;
  readonly validateAfterMigration?: boolean;
};

export type MigrateOptions<TContext = unknown> = OpenOptions<TContext>;

export type SaveOptions = {
  readonly validate?: boolean;
};

export type ValidationResult = ValidationSuccess | ValidationFailure;

export type ValidationSuccess = {
  readonly ok: true;
  readonly type: string;
  readonly version: VersionId;
  readonly latest: boolean;
};

export type ValidationFailure = {
  readonly ok: false;
  readonly error: BecomesError;
};

export type InspectionResult = InspectionSuccess | InspectionFailure;

export type InspectionSuccess = {
  readonly ok: true;
  readonly type: string;
  readonly version: string | number;
  readonly supported: boolean;
  readonly latest: boolean;
};

export type InspectionFailure = {
  readonly ok: false;
  readonly error: BecomesError;
};

export interface DocumentDefinition<
  TType extends string,
  TVersions extends readonly AnyVersionEntry[],
  TContext = unknown,
  TKeys extends EnvelopeKeyConfig = DefaultEnvelopeKeys,
> {
  readonly type: TType;
  readonly latestVersion: LatestVersion<TVersions>;
  readonly [DOCUMENT_BRAND]: {
    readonly type: TType;
    readonly versions: TVersions;
    readonly context: TContext;
    readonly envelopeKeys: TKeys;
  };

  create(): LatestPayload<TVersions>;

  open(raw: unknown, options?: OpenOptions<TContext>): Promise<LatestPayload<TVersions>>;

  save(
    data: LatestPayload<TVersions>,
    options?: SaveOptions,
  ): EnvelopeForKeys<TKeys, TType, LatestVersion<TVersions>, LatestPayload<TVersions>>;

  migrate(
    envelope: unknown,
    options?: MigrateOptions<TContext>,
  ): Promise<EnvelopeForKeys<TKeys, TType, LatestVersion<TVersions>, LatestPayload<TVersions>>>;

  validate(raw: unknown): ValidationResult;
  inspect(raw: unknown): InspectionResult;
}

export type InferLatest<TDocument> = TDocument extends {
  readonly [DOCUMENT_BRAND]: {
    readonly versions: infer TVersions extends readonly AnyVersionEntry[];
  };
}
  ? LatestPayload<TVersions>
  : never;

export type InferVersion<TDocument, TVersion extends VersionId> = TDocument extends {
  readonly [DOCUMENT_BRAND]: {
    readonly versions: infer TVersions extends readonly AnyVersionEntry[];
  };
}
  ? PayloadForVersion<TVersions, TVersion>
  : never;

export type InferEnvelope<TDocument> = TDocument extends {
  readonly [DOCUMENT_BRAND]: {
    readonly type: infer TType extends string;
    readonly versions: infer TVersions extends readonly AnyVersionEntry[];
    readonly envelopeKeys: infer TKeys extends EnvelopeKeyConfig;
  };
}
  ? EnvelopeUnion<TType, TVersions, TKeys>
  : never;
