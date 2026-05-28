import type { VersionId } from "./types.js";

/**
 * Stable error codes emitted by public `becomes` APIs.
 *
 * @remarks
 * Codes are intended for programmatic handling. Error messages may be improved
 * over time, but codes should remain stable within the same major version.
 */
export type BecomesErrorCode =
  | "INVALID_ENVELOPE"
  | "TYPE_MISMATCH"
  | "MISSING_VERSION"
  | "UNSUPPORTED_VERSION"
  | "INVALID_PAYLOAD"
  | "MIGRATION_FAILED"
  | "INVALID_MIGRATION_OUTPUT"
  | "INVALID_LATEST_PAYLOAD"
  | "INVALID_VERSION_CHAIN";

/**
 * Structured metadata used to construct a {@link BecomesError}.
 */
export type BecomesErrorOptions = {
  /** Stable programmatic failure code. */
  readonly code: BecomesErrorCode;
  /** Document type involved in the failure, when known. */
  readonly documentType?: string;
  /** Version involved in the failure, when known. */
  readonly version?: VersionId | string;
  /** Original parser, migration, or runtime failure. */
  readonly cause?: unknown;
};

/**
 * Typed error thrown by `becomes` document APIs.
 *
 * @remarks
 * The error carries stable metadata in addition to the human-readable message:
 * `code`, `documentType`, `version`, and `cause` when available.
 */
export class BecomesError extends Error {
  /** Stable programmatic failure code. */
  readonly code: BecomesErrorCode;
  /** Document type involved in the failure, when known. */
  readonly documentType?: string;
  /** Version involved in the failure, when known. */
  readonly version?: VersionId | string;

  /**
   * Create a typed `becomes` error.
   *
   * @param message - Human-readable failure message.
   * @param options - Stable error metadata.
   */
  constructor(message: string, options: BecomesErrorOptions) {
    super(message);
    this.name = "BecomesError";
    this.code = options.code;

    if (options.documentType !== undefined) {
      this.documentType = options.documentType;
    }

    if (options.version !== undefined) {
      this.version = options.version;
    }

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Preserve existing {@link BecomesError} values or wrap unknown failures.
 *
 * @remarks
 * Public result-returning APIs use this helper to expose typed failures without
 * hiding an already precise `BecomesError`.
 *
 * @param error - Unknown error-like value to normalize.
 * @param fallback - Metadata to use when wrapping a non-`BecomesError`.
 */
export function ensureBecomesError(
  error: unknown,
  fallback: BecomesErrorOptions & { readonly message: string },
): BecomesError {
  if (error instanceof BecomesError) {
    return error;
  }

  const options: BecomesErrorOptions = {
    code: fallback.code,
  };

  if (fallback.documentType !== undefined) {
    Object.assign(options, { documentType: fallback.documentType });
  }

  if (fallback.version !== undefined) {
    Object.assign(options, { version: fallback.version });
  }

  if (error !== undefined) {
    Object.assign(options, { cause: error });
  }

  return new BecomesError(fallback.message, options);
}
