import type { BecomesError } from "./errors.js";

/**
 * Type-only brand used to carry strongly typed history metadata through the
 * fluent builder API.
 *
 * @internal
 */
export const HISTORY_BRAND: unique symbol = Symbol("becomes.history");

/**
 * Type-only brand used to carry strongly typed document metadata for inference
 * helpers such as {@link InferLatest}, {@link InferVersion}, and
 * {@link InferEnvelope}.
 *
 * @internal
 */
export const DOCUMENT_BRAND: unique symbol = Symbol("becomes.document");

/**
 * Version identifier supported by the initial implementation.
 *
 * Explicit histories preserve authored numeric labels exactly; implicit
 * histories generate positive integers starting at `1`.
 *
 * @remarks
 * The public type is intentionally centralized so a future release can widen it
 * to `string | number` without changing every API signature.
 */
export type VersionId = number;

/**
 * Minimal parser-shaped schema adapter.
 *
 * Any object with a `parse(input): T` method can be used as a `becomes` schema,
 * including Zod schemas and small custom validators.
 *
 * @typeParam T - Payload type produced by the parser.
 */
export type ParseSchema<T> = {
  /**
   * Parse and validate an unknown payload.
   *
   * @throws Any schema-specific error when validation fails.
   */
  parse(input: unknown): T;
};

/**
 * Successful result from a `safeParse`-style schema.
 *
 * @typeParam T - Parsed payload type.
 */
export type SafeParseSuccess<T> = {
  /** Discriminant indicating a successful parse. */
  success: true;
  /** Parsed payload data. */
  data: T;
};

/**
 * Failed result from a `safeParse`-style schema.
 *
 * @remarks
 * Different validators expose failures under different property names. The
 * adapter recognizes both `error` and `issues` and falls back to throwing the
 * entire result object.
 */
export type SafeParseFailure = {
  /** Discriminant indicating a failed parse. */
  success: false;
  /** Optional parser error object. */
  error?: unknown;
  /** Optional parser issue list or issue object. */
  issues?: unknown;
};

/**
 * Minimal `safeParse`-shaped schema adapter.
 *
 * @typeParam T - Payload type produced when parsing succeeds.
 */
export type SafeParseSchema<T> = {
  safeParse(input: unknown): SafeParseSuccess<T> | SafeParseFailure;
};

/**
 * Supported schema-like object.
 *
 * @typeParam T - Payload type inferred from the schema.
 */
export type StandardSchema<T> = ParseSchema<T> | SafeParseSchema<T>;

/**
 * Alias for {@link StandardSchema}.
 *
 * @typeParam T - Payload type inferred from the schema.
 */
export type Schema<T> = StandardSchema<T>;

/**
 * Schema with unknown payload type, used internally when runtime code stores a
 * heterogeneous history.
 *
 * @internal
 */
export type AnySchema = StandardSchema<unknown>;

/**
 * Infer the payload type accepted by a schema adapter.
 *
 * @example
 * ```ts
 * const Title = z.object({ title: z.string() });
 * type TitlePayload = InferSchema<typeof Title>;
 * ```
 *
 * @typeParam TSchema - Schema-like object with `parse` or `safeParse`.
 */
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

/**
 * Function that transforms a valid payload from one version into a valid payload
 * for the next version in a document history.
 *
 * @typeParam From - Previous version payload.
 * @typeParam To - Next version payload.
 * @typeParam Context - Optional migration context type.
 */
export type Migration<From, To, Context = unknown> = (
  from: From,
  context: Context,
) => To | Promise<To>;

/**
 * Type-level entry in a schema history.
 *
 * @typeParam TId - Version identifier for the payload schema.
 * @typeParam TSchema - Schema adapter for the payload at this version.
 */
export type VersionEntry<TId extends VersionId, TSchema extends AnySchema> = {
  /** Stable version identifier for this schema. */
  readonly id: TId;
  /** Runtime schema used to validate this version's payload. */
  readonly schema: TSchema;
};

/**
 * Version entry with erased schema and version details.
 *
 * @internal
 */
export type AnyVersionEntry = VersionEntry<VersionId, AnySchema>;

/**
 * Last entry in a version tuple.
 *
 * @internal
 */
export type LatestEntry<TVersions extends readonly AnyVersionEntry[]> = TVersions extends readonly [
  ...(readonly AnyVersionEntry[]),
  infer TLast,
]
  ? TLast extends AnyVersionEntry
    ? TLast
    : never
  : never;

/**
 * Version identifier for the latest entry in a history tuple.
 *
 * @internal
 */
export type LatestVersion<TVersions extends readonly AnyVersionEntry[]> =
  LatestEntry<TVersions>["id"];

/**
 * Payload type for the latest entry in a history tuple.
 *
 * @internal
 */
export type LatestPayload<TVersions extends readonly AnyVersionEntry[]> = InferSchema<
  LatestEntry<TVersions>["schema"]
>;

/**
 * Union of every version identifier in a history tuple.
 *
 * @internal
 */
export type KnownVersion<TVersions extends readonly AnyVersionEntry[]> = TVersions[number]["id"];

/**
 * Payload type for a specific version in a history tuple.
 *
 * @internal
 */
export type PayloadForVersion<
  TVersions extends readonly AnyVersionEntry[],
  TVersion extends VersionId,
> =
  Extract<TVersions[number], { readonly id: TVersion }> extends infer TEntry
    ? TEntry extends AnyVersionEntry
      ? InferSchema<TEntry["schema"]>
      : never
    : never;

/**
 * Default persisted envelope owned by `becomes`.
 *
 * @remarks
 * User-provided schemas validate only the `data` payload, not this wrapper.
 *
 * @typeParam TType - Durable document type string.
 * @typeParam TVersion - Version identifier carried by this envelope.
 * @typeParam TPayload - Payload shape for the given version.
 */
export type PersistedEnvelope<TType extends string, TVersion extends VersionId, TPayload> = {
  /** Durable document type string. */
  type: TType;
  /** Persisted payload version. */
  version: TVersion;
  /** Version-specific document payload. */
  data: TPayload;
};

/**
 * Optional custom envelope key names.
 *
 * @remarks
 * Defaults are `type`, `version`, and `data`.
 */
export type EnvelopeOptions = {
  /** Envelope key that stores the document type string. */
  readonly typeKey?: string;
  /** Envelope key that stores the version identifier. */
  readonly versionKey?: string;
  /** Envelope key that stores the payload data. */
  readonly dataKey?: string;
};

/**
 * Fully resolved envelope key names.
 *
 * @internal
 */
export type EnvelopeKeyConfig = {
  readonly typeKey: string;
  readonly versionKey: string;
  readonly dataKey: string;
};

/**
 * Resolved default envelope key names.
 *
 * @internal
 */
export type DefaultEnvelopeKeys = {
  readonly typeKey: "type";
  readonly versionKey: "version";
  readonly dataKey: "data";
};

/**
 * Convert optional envelope options into concrete key names.
 *
 * @internal
 */
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

/**
 * Envelope type for a specific key configuration.
 *
 * @internal
 */
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

/**
 * Union of all persisted envelopes supported by a document definition.
 *
 * @internal
 */
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

/**
 * Type-level numeric increment used by the implicit history builder.
 *
 * @internal
 */
export type Increment<TValue extends number> = [...BuildTuple<TValue>, unknown]["length"] & number;

/**
 * Fluent builder returned by {@link version}.
 *
 * @remarks
 * Each call to `.becomes(versionId, schema, migration)` appends the next schema
 * in the linear history and type-checks the migration from the previous
 * payload to the next payload.
 *
 * @typeParam TVersions - Tuple of known version entries accumulated so far.
 * @typeParam TContext - Migration context type.
 */
export interface ExplicitHistoryBuilder<
  TVersions extends readonly AnyVersionEntry[],
  TContext = unknown,
> {
  /**
   * Type-only metadata used by inference helpers.
   *
   * @internal
   */
  readonly [HISTORY_BRAND]: {
    readonly mode: "explicit";
    readonly versions: TVersions;
    readonly context: TContext;
  };

  /**
   * Add the next explicitly labeled version to the history.
   *
   * @param versionId - Durable version label to preserve in persisted
   * envelopes.
   * @param schema - Schema that validates the next payload shape.
   * @param migration - Transformation from the previous payload type to the
   * next payload type.
   */
  becomes<const TNextId extends VersionId, TNextSchema extends AnySchema>(
    versionId: TNextId,
    schema: TNextSchema,
    migration: Migration<LatestPayload<TVersions>, InferSchema<TNextSchema>, TContext>,
  ): ExplicitHistoryBuilder<readonly [...TVersions, VersionEntry<TNextId, TNextSchema>], TContext>;
}

/**
 * Fluent builder returned by {@link schema}.
 *
 * @remarks
 * Version identifiers are generated positionally. The first schema is version
 * `1`, and each `.becomes(schema, migration)` call increments by one.
 *
 * @typeParam TVersions - Tuple of known version entries accumulated so far.
 * @typeParam TNextId - Version id to assign to the next appended schema.
 * @typeParam TContext - Migration context type.
 */
export interface ImplicitHistoryBuilder<
  TVersions extends readonly AnyVersionEntry[],
  TNextId extends number,
  TContext = unknown,
> {
  /**
   * Type-only metadata used by inference helpers.
   *
   * @internal
   */
  readonly [HISTORY_BRAND]: {
    readonly mode: "implicit";
    readonly versions: TVersions;
    readonly context: TContext;
  };

  /**
   * Add the next positional version to the history.
   *
   * @param schema - Schema that validates the next payload shape.
   * @param migration - Transformation from the previous payload type to the
   * next payload type.
   */
  becomes<TNextSchema extends AnySchema>(
    schema: TNextSchema,
    migration: Migration<LatestPayload<TVersions>, InferSchema<TNextSchema>, TContext>,
  ): ImplicitHistoryBuilder<
    readonly [...TVersions, VersionEntry<TNextId, TNextSchema>],
    Increment<TNextId>,
    TContext
  >;
}

/**
 * Erased history builder accepted by {@link defineDocument}.
 *
 * @internal
 */
export type AnyHistoryBuilder =
  | ExplicitHistoryBuilder<readonly AnyVersionEntry[], unknown>
  | ImplicitHistoryBuilder<readonly AnyVersionEntry[], number, unknown>;

/**
 * Extract the typed version tuple from a history builder.
 *
 * @internal
 */
export type HistoryVersions<THistory> = THistory extends {
  readonly [HISTORY_BRAND]: {
    readonly versions: infer TVersions extends readonly AnyVersionEntry[];
  };
}
  ? TVersions
  : never;

/**
 * Extract the migration context type from a history builder.
 *
 * @internal
 */
export type HistoryContext<THistory> = THistory extends {
  readonly [HISTORY_BRAND]: {
    readonly context: infer TContext;
  };
}
  ? TContext
  : unknown;

/**
 * Per-operation options for opening and migrating documents.
 *
 * @typeParam TContext - Migration context type expected by the history.
 */
export type OpenOptions<TContext = unknown> = {
  /**
   * Context object passed to each migration.
   *
   * @remarks
   * Overrides the `context` configured on the document definition for this
   * operation only.
   */
  readonly context?: TContext;
  /** Whether to validate the starting payload before running migrations. */
  readonly validateBeforeMigration?: boolean;
  /** Whether to validate each migration output before continuing. */
  readonly validateAfterMigration?: boolean;
};

/**
 * Per-operation options for {@link DocumentDefinition.migrate}.
 *
 * @typeParam TContext - Migration context type expected by the history.
 */
export type MigrateOptions<TContext = unknown> = OpenOptions<TContext>;

/**
 * Options for {@link DocumentDefinition.save}.
 */
export type SaveOptions = {
  /**
   * Validate the latest payload before wrapping it in an envelope.
   *
   * @defaultValue true
   */
  readonly validate?: boolean;
};

/**
 * Result returned by {@link DocumentDefinition.validate}.
 */
export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Successful validation result for a declared persisted version.
 */
export type ValidationSuccess = {
  /** Discriminant indicating validation succeeded. */
  readonly ok: true;
  /** Document type expected by the definition. */
  readonly type: string;
  /** Declared persisted version. */
  readonly version: VersionId;
  /** Whether the declared version is the latest known version. */
  readonly latest: boolean;
};

/**
 * Failed validation result with a typed `becomes` error.
 */
export type ValidationFailure = {
  /** Discriminant indicating validation failed. */
  readonly ok: false;
  /** Typed validation failure. */
  readonly error: BecomesError;
};

/**
 * Result returned by {@link DocumentDefinition.inspect}.
 */
export type InspectionResult = InspectionSuccess | InspectionFailure;

/**
 * Successful metadata inspection result.
 */
export type InspectionSuccess = {
  /** Discriminant indicating inspection succeeded. */
  readonly ok: true;
  /** Document type read from the envelope. */
  readonly type: string;
  /** Version read from the envelope. */
  readonly version: string | number;
  /** Whether the type and version are supported by the definition. */
  readonly supported: boolean;
  /** Whether the inspected envelope is already at the latest version. */
  readonly latest: boolean;
};

/**
 * Failed metadata inspection result with a typed `becomes` error.
 */
export type InspectionFailure = {
  /** Discriminant indicating inspection failed. */
  readonly ok: false;
  /** Typed inspection failure. */
  readonly error: BecomesError;
};

/**
 * Compiled document definition returned by {@link defineDocument}.
 *
 * @typeParam TType - Durable document type string.
 * @typeParam TVersions - Tuple of version entries in authored order.
 * @typeParam TContext - Migration context type.
 * @typeParam TKeys - Resolved envelope key names.
 */
export interface DocumentDefinition<
  TType extends string,
  TVersions extends readonly AnyVersionEntry[],
  TContext = unknown,
  TKeys extends EnvelopeKeyConfig = DefaultEnvelopeKeys,
> {
  /** Durable document type string. */
  readonly type: TType;
  /** Latest authored version identifier. */
  readonly latestVersion: LatestVersion<TVersions>;
  /**
   * Type-only metadata used by inference helpers.
   *
   * @internal
   */
  readonly [DOCUMENT_BRAND]: {
    readonly type: TType;
    readonly versions: TVersions;
    readonly context: TContext;
    readonly envelopeKeys: TKeys;
  };

  /**
   * Create and validate a new latest-version payload.
   *
   * @throws {@link BecomesError} with `CREATE_NOT_DEFINED` when no factory was
   * configured.
   * @throws {@link BecomesError} with `INVALID_LATEST_PAYLOAD` when the factory
   * returns data that does not satisfy the latest schema.
   */
  create(): LatestPayload<TVersions>;

  /**
   * Open an unknown persisted envelope and return the latest payload.
   *
   * @remarks
   * The version is always read from the envelope. Callers should not pass a
   * separate version hint.
   *
   * @throws {@link BecomesError} for invalid envelopes, unsupported versions,
   * invalid payloads, migration failures, or invalid migration outputs.
   */
  open(raw: unknown, options?: OpenOptions<TContext>): Promise<LatestPayload<TVersions>>;

  /**
   * Validate and wrap the latest payload in a persisted envelope.
   *
   * @throws {@link BecomesError} with `INVALID_LATEST_PAYLOAD` when validation
   * is enabled and the payload does not satisfy the latest schema.
   */
  save(
    data: LatestPayload<TVersions>,
    options?: SaveOptions,
  ): EnvelopeForKeys<TKeys, TType, LatestVersion<TVersions>, LatestPayload<TVersions>>;

  /**
   * Migrate an unknown persisted envelope to the latest persisted envelope.
   *
   * @throws {@link BecomesError} for invalid envelopes, unsupported versions,
   * invalid payloads, migration failures, or invalid migration outputs.
   */
  migrate(
    envelope: unknown,
    options?: MigrateOptions<TContext>,
  ): Promise<EnvelopeForKeys<TKeys, TType, LatestVersion<TVersions>, LatestPayload<TVersions>>>;

  /**
   * Validate the declared envelope and payload without running migrations.
   */
  validate(raw: unknown): ValidationResult;

  /**
   * Inspect envelope metadata without validating payload data or running
   * migrations.
   */
  inspect(raw: unknown): InspectionResult;
}

/**
 * Infer the latest payload type from a document definition.
 *
 * @example
 * ```ts
 * type Board = InferLatest<typeof BoardDocument>;
 * ```
 */
export type InferLatest<TDocument> = TDocument extends {
  readonly [DOCUMENT_BRAND]: {
    readonly versions: infer TVersions extends readonly AnyVersionEntry[];
  };
}
  ? LatestPayload<TVersions>
  : never;

/**
 * Infer the payload type for a specific version from a document definition.
 *
 * @example
 * ```ts
 * type BoardV2 = InferVersion<typeof BoardDocument, 2>;
 * ```
 */
export type InferVersion<TDocument, TVersion extends VersionId> = TDocument extends {
  readonly [DOCUMENT_BRAND]: {
    readonly versions: infer TVersions extends readonly AnyVersionEntry[];
  };
}
  ? PayloadForVersion<TVersions, TVersion>
  : never;

/**
 * Infer the union of every persisted envelope supported by a document
 * definition.
 *
 * @example
 * ```ts
 * type BoardEnvelope = InferEnvelope<typeof BoardDocument>;
 * ```
 */
export type InferEnvelope<TDocument> = TDocument extends {
  readonly [DOCUMENT_BRAND]: {
    readonly type: infer TType extends string;
    readonly versions: infer TVersions extends readonly AnyVersionEntry[];
    readonly envelopeKeys: infer TKeys extends EnvelopeKeyConfig;
  };
}
  ? EnvelopeUnion<TType, TVersions, TKeys>
  : never;
