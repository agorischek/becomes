export { parseWithSchema } from "./adapter.js";
export { BecomesError } from "./errors.js";
export type { BecomesErrorCode, BecomesErrorOptions } from "./errors.js";
export { defineDocument } from "./document.js";
export type { DefineDocumentOptions } from "./document.js";
export { version } from "./version-chain.js";
export type {
  DocumentDefinition,
  DecodeOptions,
  DecodeResult,
  EncodeOptions,
  EncodeResult,
  InferEnvelope,
  InferLatest,
  InferSchema,
  InferVersion,
  InspectionResult,
  Migration,
  ParseSchema,
  PersistedEnvelope,
  SafeParseFailure,
  SafeParseSchema,
  SafeParseSuccess,
  Schema,
  StandardSchema,
  ValidationResult,
  VersionId,
} from "./types.js";
