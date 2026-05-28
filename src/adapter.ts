import type { AnySchema, InferSchema, StandardSchemaV1 } from "./types.js";

type StandardSchemaCandidate = {
  readonly "~standard": {
    readonly version?: unknown;
    readonly validate?: unknown;
  };
};

/**
 * Detect Standard Schema v1 validators without invoking user code.
 *
 * @internal
 */
function hasStandardSchema(schema: unknown): schema is StandardSchemaV1<unknown, unknown> {
  return (
    typeof schema === "object" &&
    schema !== null &&
    "~standard" in schema &&
    typeof (schema as StandardSchemaCandidate)["~standard"] === "object" &&
    (schema as StandardSchemaCandidate)["~standard"] !== null &&
    (schema as StandardSchemaCandidate)["~standard"].version === 1 &&
    typeof (schema as StandardSchemaCandidate)["~standard"].validate === "function"
  );
}

/**
 * Parse payload data with a Standard Schema validator.
 *
 * @remarks
 * Standard Schema issues are thrown as-is here; document APIs catch them and
 * wrap them in stable {@link BecomesError} codes.
 *
 * @param schema - Standard Schema v1 validator.
 * @param input - Unknown payload data to parse.
 * @returns Parsed payload with the type inferred from the schema.
 * @throws Standard Schema issues or `TypeError` when the schema is not a
 * Standard Schema v1 validator.
 */
export async function parseWithSchema<TSchema extends AnySchema>(
  schema: TSchema,
  input: unknown,
): Promise<InferSchema<TSchema>> {
  if (hasStandardSchema(schema)) {
    const result = await schema["~standard"].validate(input);

    if (result.issues !== undefined) {
      throw result.issues;
    }

    return result.value as InferSchema<TSchema>;
  }

  throw new TypeError("Schema must expose Standard Schema v1.");
}
