import { parseWithSchema } from "./adapter.js";
import { BecomesError, ensureBecomesError } from "./errors.js";
import { getInternalHistory } from "./history.js";
import { DOCUMENT_BRAND } from "./types.js";
import type { InternalVersion } from "./history.js";
import type {
  AnyHistoryBuilder,
  DocumentDefinition,
  EnvelopeKeyConfig,
  EnvelopeOptions,
  HistoryContext,
  HistoryVersions,
  LatestPayload,
  LatestVersion,
  MigrateOptions,
  Migration,
  NormalizeEnvelopeKeys,
  OpenOptions,
  SaveOptions,
  ValidationResult,
  VersionId,
} from "./types.js";

type RuntimeEnvelope = {
  readonly version: VersionId;
  readonly data: unknown;
};

type DocumentRuntime<TContext> = {
  readonly type: string;
  readonly versions: readonly InternalVersion[];
  readonly latest: InternalVersion;
  readonly keys: EnvelopeKeyConfig;
  readonly context: TContext;
  readonly validateBeforeMigration: boolean;
  readonly validateAfterMigration: boolean;
  readonly create: (() => unknown) | undefined;
  readonly versionIndex: ReadonlyMap<VersionId, number>;
};

export type DefineDocumentOptions<
  THistory extends AnyHistoryBuilder,
  TType extends string,
  TContext = HistoryContext<THistory>,
  TEnvelope extends EnvelopeOptions | undefined = undefined,
> = {
  readonly type: TType;
  readonly history: THistory;
  readonly create?: () => LatestPayload<HistoryVersions<THistory>>;
  readonly context?: TContext;
  readonly envelope?: TEnvelope;
  readonly validateAfterMigration?: boolean;
  readonly validateBeforeMigration?: boolean;
};

export function defineDocument<
  const TType extends string,
  THistory extends AnyHistoryBuilder,
  TContext = HistoryContext<THistory>,
  const TEnvelope extends EnvelopeOptions | undefined = undefined,
>(
  options: DefineDocumentOptions<THistory, TType, TContext, TEnvelope>,
): DocumentDefinition<
  TType,
  HistoryVersions<THistory>,
  TContext,
  NormalizeEnvelopeKeys<TEnvelope>
> {
  const history = getInternalHistory(options.history);
  const latest = history.versions.at(-1) as InternalVersion;

  const versionIndex = new Map<VersionId, number>();

  history.versions.forEach((entry, index) => {
    versionIndex.set(entry.id, index);
  });

  const runtime: DocumentRuntime<TContext> = {
    type: options.type,
    versions: history.versions,
    latest,
    keys: {
      typeKey: options.envelope?.typeKey ?? "type",
      versionKey: options.envelope?.versionKey ?? "version",
      dataKey: options.envelope?.dataKey ?? "data",
    },
    context: options.context as TContext,
    validateBeforeMigration: options.validateBeforeMigration ?? true,
    validateAfterMigration: options.validateAfterMigration ?? true,
    create: options.create,
    versionIndex,
  };

  const document = {
    type: options.type,
    latestVersion: latest.id as LatestVersion<HistoryVersions<THistory>>,
    [DOCUMENT_BRAND]: {
      type: options.type,
      versions: undefined as unknown as HistoryVersions<THistory>,
      context: undefined as unknown as TContext,
      envelopeKeys: undefined as unknown as NormalizeEnvelopeKeys<TEnvelope>,
    },

    create() {
      if (!runtime.create) {
        throw new BecomesError("No create function was provided.", {
          code: "CREATE_NOT_DEFINED",
          documentType: runtime.type,
          version: runtime.latest.id,
        });
      }

      const created = runtime.create();
      return parsePayload(runtime, runtime.latest, created, "INVALID_LATEST_PAYLOAD");
    },

    async open(raw: unknown, operationOptions?: OpenOptions<TContext>) {
      const envelope = readEnvelope(runtime, raw);
      const payload = await migratePayload(runtime, envelope, operationOptions);
      return payload as LatestPayload<HistoryVersions<THistory>>;
    },

    save(data: LatestPayload<HistoryVersions<THistory>>, saveOptions?: SaveOptions) {
      const payload =
        saveOptions?.validate === false
          ? data
          : parsePayload(runtime, runtime.latest, data, "INVALID_LATEST_PAYLOAD");

      return makeEnvelope(runtime, runtime.latest.id, payload);
    },

    async migrate(raw: unknown, operationOptions?: MigrateOptions<TContext>) {
      const envelope = readEnvelope(runtime, raw);
      const payload = await migratePayload(runtime, envelope, operationOptions);
      return makeEnvelope(runtime, runtime.latest.id, payload);
    },

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

  return document as DocumentDefinition<
    TType,
    HistoryVersions<THistory>,
    TContext,
    NormalizeEnvelopeKeys<TEnvelope>
  >;
}

async function migratePayload<TContext>(
  runtime: DocumentRuntime<TContext>,
  envelope: RuntimeEnvelope,
  options: OpenOptions<TContext> | undefined,
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

  if (!runtime.versionIndex.has(versionValue as VersionId)) {
    throw new BecomesError(`Unsupported version: ${String(versionValue)}.`, {
      code: "UNSUPPORTED_VERSION",
      documentType: runtime.type,
      version: String(versionValue),
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

function readRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  throw new BecomesError("Envelope must be an object.", {
    code: "INVALID_ENVELOPE",
  });
}

function entryForVersion<TContext>(
  runtime: DocumentRuntime<TContext>,
  version: VersionId,
): InternalVersion {
  const index = runtime.versionIndex.get(version);
  return runtime.versions[index as number] as InternalVersion;
}

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
