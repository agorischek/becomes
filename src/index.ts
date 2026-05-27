export { parseWithSchema } from "./adapter.js";
export { BecomesError } from "./errors.js";
export type { BecomesErrorCode, BecomesErrorOptions } from "./errors.js";
export { defineDocument } from "./document.js";
export type { DefineDocumentOptions } from "./document.js";
export { schema, version } from "./history.js";
export type {
  DocumentDefinition,
  InferEnvelope,
  InferLatest,
  InferSchema,
  InferVersion,
  InspectionResult,
  MigrateOptions,
  Migration,
  OpenOptions,
  ParseSchema,
  PersistedEnvelope,
  SafeParseFailure,
  SafeParseSchema,
  SafeParseSuccess,
  SaveOptions,
  Schema,
  StandardSchema,
  ValidationResult,
  VersionId,
} from "./types.js";
