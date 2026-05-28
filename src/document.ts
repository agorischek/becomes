import { parseWithSchema } from "./adapter.js";
import { BecomesError, ensureBecomesError } from "./errors.js";
import { getInternalVersionChain } from "./version-chain.js";
import { DOCUMENT_BRAND } from "./types.js";
import type { InternalVersion } from "./version-chain.js";
import type {
  AnyVersionChainBuilder,
  CreateFactory,
  DocumentDefinition,
  EnvelopeKeyConfig,
  EnvelopeOptions,
  VersionChainContext,
  VersionChainVersions,
  LatestPayload,
  LatestVersion,
  Migration,
  NormalizeEnvelopeKeys,
  DecodeOptions,
  EncodeOptions,
  ValidationResult,
  VersionId,
} from "./types.js";

type RuntimeEnvelope = {
  readonly version: VersionId;
  readonly data: unknown;
};

/**
 * Fully normalized runtime state captured by a document definition.
 *
 * @internal
 */
type DocumentRuntime<TContext> = {
  readonly type: string;
  readonly versions: readonly InternalVersion[];
  readonly latest: InternalVersion;
  readonly keys: EnvelopeKeyConfig;
  readonly context: TContext;
  readonly validateBeforeMigration: boolean;
  readonly validateAfterMigration: boolean;
  readonly create: ((...args: never[]) => unknown) | undefined;
  readonly versionIndex: ReadonlyMap<VersionId, number>;
};

/**
 * Options accepted by {@link defineDocument}.
 *
 * @typeParam TVersionChain - Fluent version-chain builder.
 * @typeParam TType - Durable document type string.
 * @typeParam TContext - Migration context type.
 * @typeParam TEnvelope - Optional custom envelope key configuration.
 */
export type DefineDocumentOptions<
  TVersionChain extends AnyVersionChainBuilder,
  TType extends string,
  TContext = VersionChainContext<TVersionChain>,
  TEnvelope extends EnvelopeOptions | undefined = undefined,
> = {
  /** Durable document type string stored in persisted envelopes. */
  readonly type: TType;
  /** Linear version chain produced by {@link version}. */
  readonly versions: TVersionChain;
  /**
   * Factory for creating a new latest-version payload.
   *
   * @remarks
   * The factory may accept application-defined arguments. Those argument types
   * are preserved on the returned document's `create` method.
   *
   * The returned value is validated against the latest schema when
   * {@link DocumentDefinition.create} is called.
   */
  readonly create?: CreateFactory<LatestPayload<VersionChainVersions<TVersionChain>>>;
  /**
   * Default context object passed to migrations.
   *
   * @remarks
   * Operation-level context passed to `decode` overrides this value.
   */
  readonly context?: TContext;
  /** Optional custom persisted envelope key names. */
  readonly envelope?: TEnvelope;
  /**
   * Validate each migration output before continuing to the next step.
   *
   * @defaultValue true
   */
  readonly validateAfterMigration?: boolean;
  /**
   * Validate the starting payload before running migrations.
   *
   * @defaultValue true
   */
  readonly validateBeforeMigration?: boolean;
};

/**
 * Compile a version chain into a document definition.
 *
 * @remarks
 * The returned definition owns envelope parsing, version dispatch, payload
 * validation, migration execution, encoding, metadata inspection, and type
 * inference. User schemas validate only payload data.
 *
 * @example
 * ```ts
 * const BoardDocument = defineDocument({
 *   type: "tasks.board",
 *   versions: version(1, BoardV1)
 *     .becomes(2, BoardV2, migrateV1ToV2)
 *     .becomes(3, BoardV3, migrateV2ToV3),
 *   create: () => ({ columns: [], cards: {}, archivedCardIds: [] }),
 * });
 * ```
 *
 * @typeParam TType - Durable document type string.
 * @typeParam TVersionChain - Fluent version-chain builder.
 * @typeParam TContext - Migration context type.
 * @typeParam TEnvelope - Optional custom envelope key configuration.
 */
export function defineDocument<
  const TType extends string,
  TVersionChain extends AnyVersionChainBuilder,
  TCreate extends CreateFactory<LatestPayload<VersionChainVersions<TVersionChain>>>,
  TContext = VersionChainContext<TVersionChain>,
  const TEnvelope extends EnvelopeOptions | undefined = undefined,
>(
  options: DefineDocumentOptions<TVersionChain, TType, TContext, TEnvelope> & {
    readonly create: TCreate;
  },
): DocumentDefinition<
  TType,
  VersionChainVersions<TVersionChain>,
  TContext,
  NormalizeEnvelopeKeys<TEnvelope>,
  TCreate
>;
export function defineDocument<
  const TType extends string,
  TVersionChain extends AnyVersionChainBuilder,
  TContext = VersionChainContext<TVersionChain>,
  const TEnvelope extends EnvelopeOptions | undefined = undefined,
>(
  options: Omit<DefineDocumentOptions<TVersionChain, TType, TContext, TEnvelope>, "create"> & {
    readonly create?: never;
  },
): DocumentDefinition<
  TType,
  VersionChainVersions<TVersionChain>,
  TContext,
  NormalizeEnvelopeKeys<TEnvelope>,
  undefined
>;
export function defineDocument<
  const TType extends string,
  TVersionChain extends AnyVersionChainBuilder,
  TContext = VersionChainContext<TVersionChain>,
  const TEnvelope extends EnvelopeOptions | undefined = undefined,
>(
  options: DefineDocumentOptions<TVersionChain, TType, TContext, TEnvelope>,
): DocumentDefinition<
  TType,
  VersionChainVersions<TVersionChain>,
  TContext,
  NormalizeEnvelopeKeys<TEnvelope>,
  CreateFactory<LatestPayload<VersionChainVersions<TVersionChain>>> | undefined
> {
  const internalVersionChain = getInternalVersionChain(options.versions);
  const latest = internalVersionChain.versions.at(-1) as InternalVersion;

  const versionIndex = new Map<VersionId, number>();

  internalVersionChain.versions.forEach((entry, index) => {
    versionIndex.set(entry.id, index);
  });

  const runtime: DocumentRuntime<TContext> = {
    type: options.type,
    versions: internalVersionChain.versions,
    latest,
    keys: {
      typeKey: options.envelope?.typeKey ?? "type",
      versionKey: options.envelope?.versionKey ?? "version",
      dataKey: options.envelope?.dataKey ?? "data",
    },
    context: options.context as TContext,
    validateBeforeMigration: options.validateBeforeMigration ?? true,
    validateAfterMigration: options.validateAfterMigration ?? true,
    create: options.create as ((...args: never[]) => unknown) | undefined,
    versionIndex,
  };

  const document = {
    type: options.type,
    latestVersion: latest.id as LatestVersion<VersionChainVersions<TVersionChain>>,
    [DOCUMENT_BRAND]: {
      type: options.type,
      versions: undefined as unknown as VersionChainVersions<TVersionChain>,
      context: undefined as unknown as TContext,
      envelopeKeys: undefined as unknown as NormalizeEnvelopeKeys<TEnvelope>,
    },

    /** @inheritdoc */
    async decode(raw: unknown, operationOptions?: DecodeOptions<TContext>) {
      if (raw === null || raw === undefined) {
        return {
          status: "missing",
        };
      }

      try {
        const envelope = readEnvelope(runtime, raw);
        const payload = await migratePayload(runtime, envelope, operationOptions);
        const latestEnvelope = makeEnvelope(runtime, runtime.latest.id, payload);

        if (Object.is(envelope.version, runtime.latest.id)) {
          return {
            status: "current",
            value: payload,
            version: envelope.version,
            envelope: latestEnvelope,
          };
        }

        return {
          status: "migrated",
          value: payload,
          fromVersion: envelope.version,
          toVersion: runtime.latest.id,
          envelope: latestEnvelope,
        };
      } catch (error) {
        const becomesError = ensureBecomesError(error, {
          code: "INVALID_ENVELOPE",
          documentType: runtime.type,
          message: "Decode failed.",
        });

        if (becomesError.code === "UNSUPPORTED_VERSION" && becomesError.version !== undefined) {
          return {
            status: "unsupported-version",
            version: becomesError.version,
            error: becomesError,
          };
        }

        return {
          status: "invalid",
          error: becomesError,
        };
      }
    },

    /** @inheritdoc */
    encode(
      data: LatestPayload<VersionChainVersions<TVersionChain>>,
      encodeOptions?: EncodeOptions,
    ) {
      try {
        const payload =
          encodeOptions?.validate === false
            ? data
            : parsePayload(runtime, runtime.latest, data, "INVALID_LATEST_PAYLOAD");

        return {
          status: "encoded",
          value: payload,
          version: runtime.latest.id,
          envelope: makeEnvelope(runtime, runtime.latest.id, payload),
        };
      } catch (error) {
        return {
          status: "invalid",
          error: ensureBecomesError(error, {
            code: "INVALID_LATEST_PAYLOAD",
            documentType: runtime.type,
            version: runtime.latest.id,
            message: "Encode failed.",
          }),
        };
      }
    },

    /** @inheritdoc */
    validate(raw: unknown): ValidationResult {
      try {
        const envelope = readEnvelope(runtime, raw);
        const entry = entryForVersion(runtime, envelope.version);
        parsePayload(runtime, entry, envelope.data, "INVALID_PAYLOAD");

        return {
          ok: true,
          type: runtime.type,
          version: envelope.version,
          latest: Object.is(envelope.version, runtime.latest.id),
        };
      } catch (error) {
        return {
          ok: false,
          error: ensureBecomesError(error, {
            code: "INVALID_ENVELOPE",
            documentType: runtime.type,
            message: "Validation failed.",
          }),
        };
      }
    },

    /** @inheritdoc */
    inspect(raw: unknown) {
      try {
        const record = readRecord(raw);
        const typeValue = record[runtime.keys.typeKey];

        if (typeof typeValue !== "string") {
          throw new BecomesError("Envelope type must be a string.", {
            code: "INVALID_ENVELOPE",
            documentType: runtime.type,
          });
        }

        if (!Object.hasOwn(record, runtime.keys.versionKey)) {
          throw new BecomesError("Envelope is missing a version.", {
            code: "MISSING_VERSION",
            documentType: runtime.type,
          });
        }

        const versionValue = record[runtime.keys.versionKey];

        if (typeof versionValue !== "number" && typeof versionValue !== "string") {
          throw new BecomesError("Envelope version must be a string or number.", {
            code: "INVALID_ENVELOPE",
            documentType: runtime.type,
          });
        }

        const supported =
          typeValue === runtime.type && runtime.versionIndex.has(versionValue as VersionId);

        return {
          ok: true,
          type: typeValue,
          version: versionValue,
          supported,
          latest: supported && Object.is(versionValue, runtime.latest.id),
        };
      } catch (error) {
        return {
          ok: false,
          error: ensureBecomesError(error, {
            code: "INVALID_ENVELOPE",
            documentType: runtime.type,
            message: "Inspection failed.",
          }),
        };
      }
    },
  };

  if (runtime.create) {
    const create = runtime.create;

    Object.assign(document, {
      /** @inheritdoc */
      create(...args: never[]) {
        const created = create(...args);
        return parsePayload(runtime, runtime.latest, created, "INVALID_LATEST_PAYLOAD");
      },
    });
  }

  return document as DocumentDefinition<
    TType,
    VersionChainVersions<TVersionChain>,
    TContext,
    NormalizeEnvelopeKeys<TEnvelope>,
    CreateFactory<LatestPayload<VersionChainVersions<TVersionChain>>> | undefined
  >;
}

/**
 * Validate and migrate a parsed runtime envelope to the latest payload.
 *
 * @internal
 */
async function migratePayload<TContext>(
  runtime: DocumentRuntime<TContext>,
  envelope: RuntimeEnvelope,
  options: DecodeOptions<TContext> | undefined,
): Promise<unknown> {
  const startIndex = runtime.versionIndex.get(envelope.version) as number;

  const shouldValidateBefore = options?.validateBeforeMigration ?? runtime.validateBeforeMigration;
  const shouldValidateAfter = options?.validateAfterMigration ?? runtime.validateAfterMigration;
  const context = options?.context ?? runtime.context;
  const startEntry = runtime.versions[startIndex] as InternalVersion;

  let payload = shouldValidateBefore
    ? parsePayload(runtime, startEntry, envelope.data, "INVALID_PAYLOAD")
    : envelope.data;

  for (let index = startIndex + 1; index < runtime.versions.length; index += 1) {
    const nextEntry = runtime.versions[index] as InternalVersion;
    const migration = nextEntry.migrateFromPrevious as Migration<unknown, unknown, TContext>;

    try {
      payload = await migration(payload, context);
    } catch (cause) {
      throw new BecomesError("Migration failed.", {
        code: "MIGRATION_FAILED",
        documentType: runtime.type,
        version: nextEntry.id,
        cause,
      });
    }

    if (shouldValidateAfter) {
      payload = parsePayload(runtime, nextEntry, payload, "INVALID_MIGRATION_OUTPUT");
    }
  }

  return payload;
}

/**
 * Parse and validate the `becomes` envelope fields without parsing payload data.
 *
 * @internal
 */
function readEnvelope<TContext>(runtime: DocumentRuntime<TContext>, raw: unknown): RuntimeEnvelope {
  const record = readRecord(raw);
  const typeValue = record[runtime.keys.typeKey];

  if (typeValue !== runtime.type) {
    throw new BecomesError(`Expected document type "${runtime.type}".`, {
      code: "TYPE_MISMATCH",
      documentType: runtime.type,
    });
  }

  if (!Object.hasOwn(record, runtime.keys.versionKey)) {
    throw new BecomesError("Envelope is missing a version.", {
      code: "MISSING_VERSION",
      documentType: runtime.type,
    });
  }

  const versionValue = record[runtime.keys.versionKey];

  if (typeof versionValue !== "number" && typeof versionValue !== "string") {
    throw new BecomesError("Envelope version must be a string or number.", {
      code: "INVALID_ENVELOPE",
      documentType: runtime.type,
    });
  }

  if (!runtime.versionIndex.has(versionValue as VersionId)) {
    throw new BecomesError(`Unsupported version: ${String(versionValue)}.`, {
      code: "UNSUPPORTED_VERSION",
      documentType: runtime.type,
      version: versionValue,
    });
  }

  if (!Object.hasOwn(record, runtime.keys.dataKey)) {
    throw new BecomesError("Envelope is missing data.", {
      code: "INVALID_ENVELOPE",
      documentType: runtime.type,
      version: versionValue as VersionId,
    });
  }

  return {
    version: versionValue as VersionId,
    data: record[runtime.keys.dataKey],
  };
}

/**
 * Narrow unknown input to a non-array object record.
 *
 * @internal
 */
function readRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  throw new BecomesError("Envelope must be an object.", {
    code: "INVALID_ENVELOPE",
  });
}

/**
 * Look up the normalized runtime version entry for a supported version.
 *
 * @internal
 */
function entryForVersion<TContext>(
  runtime: DocumentRuntime<TContext>,
  version: VersionId,
): InternalVersion {
  const index = runtime.versionIndex.get(version);
  return runtime.versions[index as number] as InternalVersion;
}

/**
 * Validate payload data with a version schema and normalize failures into
 * stable {@link BecomesError} codes.
 *
 * @internal
 */
function parsePayload<TContext>(
  runtime: DocumentRuntime<TContext>,
  entry: InternalVersion,
  input: unknown,
  code: "INVALID_PAYLOAD" | "INVALID_MIGRATION_OUTPUT" | "INVALID_LATEST_PAYLOAD",
): unknown {
  try {
    return parseWithSchema(entry.schema, input);
  } catch (cause) {
    throw new BecomesError("Payload validation failed.", {
      code,
      documentType: runtime.type,
      version: entry.id,
      cause,
    });
  }
}

/**
 * Build a persisted envelope using the document's configured key names.
 *
 * @internal
 */
function makeEnvelope<TContext>(
  runtime: DocumentRuntime<TContext>,
  version: VersionId,
  data: unknown,
): Record<string, unknown> {
  return {
    [runtime.keys.typeKey]: runtime.type,
    [runtime.keys.versionKey]: version,
    [runtime.keys.dataKey]: data,
  };
}
