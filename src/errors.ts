import type { VersionId } from "./types.js";

export type BecomesErrorCode =
  | "INVALID_ENVELOPE"
  | "TYPE_MISMATCH"
  | "MISSING_VERSION"
  | "UNSUPPORTED_VERSION"
  | "INVALID_PAYLOAD"
  | "MIGRATION_FAILED"
  | "INVALID_MIGRATION_OUTPUT"
  | "INVALID_LATEST_PAYLOAD"
  | "CREATE_NOT_DEFINED"
  | "INVALID_HISTORY";

export type BecomesErrorOptions = {
  readonly code: BecomesErrorCode;
  readonly documentType?: string;
  readonly version?: VersionId | string;
  readonly cause?: unknown;
};

export class BecomesError extends Error {
  readonly code: BecomesErrorCode;
  readonly documentType?: string;
  readonly version?: VersionId | string;

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
