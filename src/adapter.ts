import type { AnySchema, InferSchema, SafeParseSchema } from "./types.js";

type Parser = {
  parse(input: unknown): unknown;
};

function hasParse(schema: unknown): schema is Parser {
  return (
    typeof schema === "object" &&
    schema !== null &&
    "parse" in schema &&
    typeof schema.parse === "function"
  );
}

function hasSafeParse(schema: unknown): schema is SafeParseSchema<unknown> {
  return (
    typeof schema === "object" &&
    schema !== null &&
    "safeParse" in schema &&
    typeof schema.safeParse === "function"
  );
}

export function parseWithSchema<TSchema extends AnySchema>(
  schema: TSchema,
  input: unknown,
): InferSchema<TSchema> {
  if (hasSafeParse(schema)) {
    const result = schema.safeParse(input);

    if (result.success) {
      return result.data as InferSchema<TSchema>;
    }

    throw result.error ?? result.issues ?? result;
  }

  if (hasParse(schema)) {
    return schema.parse(input) as InferSchema<TSchema>;
  }

  throw new TypeError("Schema must expose parse(input) or safeParse(input).");
}
