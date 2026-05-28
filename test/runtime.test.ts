import { describe, expect, test } from "bun:test";
import {
  BecomesError,
  defineDocument,
  version,
  type DecodeResult,
  type EncodeResult,
  type Schema,
  type StandardSchemaV1,
} from "../src/index.js";
import { parseWithSchema } from "../src/adapter.js";
import { ensureBecomesError } from "../src/errors.js";

type V1 = {
  title: string;
};

type V2 = {
  title: string;
  count: number;
};

type V3 = {
  title: string;
  count: number;
  done: boolean;
};

type TestContext = {
  doneDefault: boolean;
};

const v1Schema = objectSchema<V1>((record) => ({
  title: expectString(record.title, "title"),
}));

const v2Schema = objectSchema<V2>((record) => ({
  title: expectString(record.title, "title"),
  count: expectNumber(record.count, "count"),
}));

const v3Schema = objectSchema<V3>((record) => ({
  title: expectString(record.title, "title"),
  count: expectNumber(record.count, "count"),
  done: expectBoolean(record.done, "done"),
}));

const explicitVersions = version<1, typeof v1Schema, TestContext>(1, v1Schema)
  .becomes(2, v2Schema, (value) => ({
    title: value.title,
    count: 1,
  }))
  .becomes(3, v3Schema, async (value, context) => ({
    ...value,
    done: context.doneDefault,
  }));

const TestDocument = defineDocument({
  type: "tests.note",
  versions: explicitVersions,
  context: {
    doneDefault: false,
  },
  create: () => ({
    title: "new",
    count: 0,
    done: false,
  }),
});

describe("document runtime APIs", () => {
  test("decodes latest-version documents without migration", async () => {
    await expect(
      TestDocument.decode({
        type: "tests.note",
        version: 3,
        data: {
          title: "ready",
          count: 2,
          done: true,
        },
      }),
    ).resolves.toEqual({
      status: "current",
      value: {
        title: "ready",
        count: 2,
        done: true,
      },
      version: 3,
      envelope: {
        type: "tests.note",
        version: 3,
        data: {
          title: "ready",
          count: 2,
          done: true,
        },
      },
    });
  });

  test("decodes older documents and migrates to latest", async () => {
    await expect(
      TestDocument.decode({
        type: "tests.note",
        version: 1,
        data: {
          title: "old",
        },
      }),
    ).resolves.toEqual({
      status: "migrated",
      value: {
        title: "old",
        count: 1,
        done: false,
      },
      fromVersion: 1,
      toVersion: 3,
      envelope: {
        type: "tests.note",
        version: 3,
        data: {
          title: "old",
          count: 1,
          done: false,
        },
      },
    });
  });

  test("uses operation context for async migrations", async () => {
    await expect(
      TestDocument.decode(
        {
          type: "tests.note",
          version: 2,
          data: {
            title: "middle",
            count: 5,
          },
        },
        {
          context: {
            doneDefault: true,
          },
        },
      ),
    ).resolves.toEqual({
      status: "migrated",
      value: {
        title: "middle",
        count: 5,
        done: true,
      },
      fromVersion: 2,
      toVersion: 3,
      envelope: {
        type: "tests.note",
        version: 3,
        data: {
          title: "middle",
          count: 5,
          done: true,
        },
      },
    });
  });

  test("validates payload before migration", async () => {
    const migrationCalls: string[] = [];
    const document = defineDocument({
      type: "tests.before",
      versions: version(1, v1Schema).becomes(2, v2Schema, (value) => {
        migrationCalls.push(value.title);
        return {
          title: value.title,
          count: 1,
        };
      }),
    });

    const error = await expectDecodeInvalid(
      document.decode({
        type: "tests.before",
        version: 1,
        data: {
          title: 123,
        },
      }),
      "INVALID_PAYLOAD",
    );

    expect(error.version).toBe(1);
    expect(migrationCalls).toEqual([]);
  });

  test("validates payload after migration", async () => {
    const document = defineDocument({
      type: "tests.after",
      versions: version(1, v1Schema).becomes(
        2,
        v2Schema,
        () =>
          ({
            title: "bad",
            count: "wrong",
          }) as unknown as V2,
      ),
    });

    await expectDecodeInvalid(
      document.decode({
        type: "tests.after",
        version: 1,
        data: {
          title: "old",
        },
      }),
      "INVALID_MIGRATION_OUTPUT",
    );
  });

  test("can skip before and after migration validation", async () => {
    const document = defineDocument({
      type: "tests.skip",
      versions: version(1, v1Schema).becomes(
        2,
        v2Schema,
        () =>
          ({
            title: "unchecked",
            count: "also unchecked",
          }) as unknown as V2,
      ),
    });

    const skipped = await document.decode(
      {
        type: "tests.skip",
        version: 1,
        data: {
          title: 123,
        },
      },
      {
        validateBeforeMigration: false,
        validateAfterMigration: false,
      },
    );

    expect(skipped as unknown).toEqual({
      status: "migrated",
      value: {
        title: "unchecked",
        count: "also unchecked",
      },
      fromVersion: 1,
      toVersion: 2,
      envelope: {
        type: "tests.skip",
        version: 2,
        data: {
          title: "unchecked",
          count: "also unchecked",
        },
      },
    });
  });

  test("reports missing and malformed envelopes", async () => {
    await expect(TestDocument.decode(null)).resolves.toEqual({
      status: "missing",
    });
    await expect(TestDocument.decode(undefined)).resolves.toEqual({
      status: "missing",
    });
    await expectDecodeInvalid(TestDocument.decode([]), "INVALID_ENVELOPE");
    await expectDecodeInvalid(
      TestDocument.decode({
        type: "tests.note",
        version: null,
        data: {},
      }),
      "INVALID_ENVELOPE",
    );
  });

  test("reports the wrong document type", async () => {
    await expectDecodeInvalid(
      TestDocument.decode({
        type: "tests.other",
        version: 1,
        data: {
          title: "old",
        },
      }),
      "TYPE_MISMATCH",
    );
  });

  test("reports a missing version", async () => {
    await expectDecodeInvalid(
      TestDocument.decode({
        type: "tests.note",
        data: {
          title: "old",
        },
      }),
      "MISSING_VERSION",
    );
  });

  test("reports an unknown version", async () => {
    const error = await expectDecodeUnsupported(
      TestDocument.decode({
        type: "tests.note",
        version: 99,
        data: {
          title: "future",
        },
      }),
    );

    expect(error.version).toBe(99);

    const stringVersionError = await expectDecodeUnsupported(
      TestDocument.decode({
        type: "tests.note",
        version: "future",
        data: {},
      }),
    );

    expect(stringVersionError.version).toBe("future");
  });

  test("reports envelopes without data", async () => {
    await expectDecodeInvalid(
      TestDocument.decode({
        type: "tests.note",
        version: 1,
      }),
      "INVALID_ENVELOPE",
    );
  });

  test("reports invalid latest payloads", async () => {
    await expectDecodeInvalid(
      TestDocument.decode({
        type: "tests.note",
        version: 3,
        data: {
          title: "bad",
          count: 1,
          done: "no",
        },
      }),
      "INVALID_PAYLOAD",
    );
  });

  test("reports thrown migration errors", async () => {
    const cause = new Error("boom");
    const document = defineDocument({
      type: "tests.throw",
      versions: version(1, v1Schema).becomes(2, v2Schema, () => {
        throw cause;
      }),
    });

    const error = await expectDecodeInvalid(
      document.decode({
        type: "tests.throw",
        version: 1,
        data: {
          title: "old",
        },
      }),
      "MIGRATION_FAILED",
    );

    expect(error.cause).toBe(cause);
  });

  test("encodes latest payload with the correct envelope", async () => {
    await expect(
      TestDocument.encode({
        title: "saved",
        count: 7,
        done: true,
      }),
    ).resolves.toEqual({
      status: "encoded",
      version: 3,
      value: {
        title: "saved",
        count: 7,
        done: true,
      },
      envelope: {
        type: "tests.note",
        version: 3,
        data: {
          title: "saved",
          count: 7,
          done: true,
        },
      },
    });
  });

  test("can skip encode validation", async () => {
    await expect(
      TestDocument.encode(
        {
          title: "saved",
          count: "not checked",
          done: true,
        } as unknown as V3,
        {
          validate: false,
        },
      ) as unknown,
    ).resolves.toEqual({
      status: "encoded",
      version: 3,
      value: {
        title: "saved",
        count: "not checked",
        done: true,
      },
      envelope: {
        type: "tests.note",
        version: 3,
        data: {
          title: "saved",
          count: "not checked",
          done: true,
        },
      },
    });
  });

  test("reports invalid latest payloads on encode and rejects invalid create output", async () => {
    const error = await expectEncodeInvalid(
      TestDocument.encode({
        title: "bad",
        count: Number.NaN,
        done: true,
      }),
      "INVALID_LATEST_PAYLOAD",
    );

    expect(error.version).toBe(3);

    const invalidCreate = defineDocument({
      type: "tests.invalid-create",
      versions: version(1, v3Schema),
      create: () =>
        ({
          title: "bad",
        }) as V3,
    });

    await expect(invalidCreate.create()).rejects.toThrow(BecomesError);
  });

  test("creates latest payloads and omits missing create functions", async () => {
    await expect(TestDocument.create()).resolves.toEqual({
      title: "new",
      count: 0,
      done: false,
    });

    const documentWithArgs = defineDocument({
      type: "tests.create-args",
      versions: version(1, v3Schema),
      create: (title: string, done: boolean) => ({
        title,
        count: title.length,
        done,
      }),
    });

    await expect(documentWithArgs.create("from args", true)).resolves.toEqual({
      title: "from args",
      count: 9,
      done: true,
    });

    const document = defineDocument({
      type: "tests.no-create",
      versions: version(1, v1Schema),
    });

    expect("create" in document).toBe(false);
    expect("migrate" in TestDocument).toBe(false);
  });

  test("validates without migration", async () => {
    const document = defineDocument({
      type: "tests.validate",
      versions: version(1, v1Schema).becomes(2, v2Schema, () => {
        throw new Error("validate should not migrate");
      }),
    });

    await expect(
      document.validate({
        type: "tests.validate",
        version: 1,
        data: {
          title: "old",
        },
      }),
    ).resolves.toEqual({
      ok: true,
      type: "tests.validate",
      version: 1,
      latest: false,
    });

    const result = await document.validate({
      type: "tests.validate",
      version: 1,
      data: {
        title: 1,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe("INVALID_PAYLOAD");
  });

  test("inspects metadata without payload validation or migration", () => {
    const document = defineDocument({
      type: "tests.inspect",
      versions: version(1, v1Schema).becomes(2, v2Schema, () => {
        throw new Error("inspect should not migrate");
      }),
    });

    expect(
      document.inspect({
        type: "tests.inspect",
        version: 1,
        data: {
          title: 123,
        },
      }),
    ).toEqual({
      ok: true,
      type: "tests.inspect",
      version: 1,
      supported: true,
      latest: false,
    });

    expect(
      document.inspect({
        type: "tests.other",
        version: "v9",
      }),
    ).toEqual({
      ok: true,
      type: "tests.other",
      version: "v9",
      supported: false,
      latest: false,
    });
  });

  test("returns inspection failures for malformed metadata", () => {
    const missingVersion = TestDocument.inspect({
      type: "tests.note",
    });
    const invalidType = TestDocument.inspect({
      type: 123,
      version: 1,
    });
    const invalidVersion = TestDocument.inspect({
      type: "tests.note",
      version: null,
    });

    expect(missingVersion.ok).toBe(false);
    expect(invalidType.ok).toBe(false);
    expect(invalidVersion.ok).toBe(false);
  });

  test("supports explicit non-contiguous version ids", async () => {
    const document = defineDocument({
      type: "tests.protocol",
      versions: version(10, v1Schema).becomes(20, v2Schema, (value) => ({
        title: value.title,
        count: 20,
      })),
    });

    await expect(
      document.decode({
        type: "tests.protocol",
        version: 10,
        data: {
          title: "old",
        },
      }),
    ).resolves.toEqual({
      status: "migrated",
      value: {
        title: "old",
        count: 20,
      },
      fromVersion: 10,
      toVersion: 20,
      envelope: {
        type: "tests.protocol",
        version: 20,
        data: {
          title: "old",
          count: 20,
        },
      },
    });

    expect(document.latestVersion).toBe(20);
  });

  test("rejects duplicate explicit version ids", () => {
    expect(() =>
      version(1, v1Schema).becomes(1, v2Schema, (value) => ({
        title: value.title,
        count: 1,
      })),
    ).toThrow(BecomesError);

    try {
      version(1, v1Schema).becomes(1, v2Schema, (value) => ({
        title: value.title,
        count: 1,
      }));
    } catch (error) {
      expect(error).toBeInstanceOf(BecomesError);
      expect((error as BecomesError).code).toBe("INVALID_VERSION_CHAIN");
    }
  });

  test("supports custom envelope keys", async () => {
    const document = defineDocument({
      type: "tests.custom",
      versions: version(1, v1Schema),
      envelope: {
        typeKey: "kind",
        versionKey: "revision",
        dataKey: "payload",
      },
    });

    const raw = {
      kind: "tests.custom",
      revision: 1,
      payload: {
        title: "custom",
      },
    } as const;

    await expect(document.decode(raw)).resolves.toEqual({
      status: "current",
      value: {
        title: "custom",
      },
      version: 1,
      envelope: raw,
    });

    await expect(
      document.encode({
        title: "custom",
      }),
    ).resolves.toEqual({
      status: "encoded",
      value: {
        title: "custom",
      },
      version: 1,
      envelope: raw,
    });
  });
});

describe("schema validation and typed errors", () => {
  test("supports Standard Schema validators", async () => {
    const standardSchema: StandardSchemaV1<unknown, V1> = {
      "~standard": {
        version: 1,
        vendor: "tests",
        async validate(input) {
          if (typeof input === "object" && input !== null && !Array.isArray(input)) {
            const record = input as Record<string, unknown>;

            if (typeof record.title === "string") {
              return {
                value: {
                  title: record.title,
                },
              };
            }
          }

          return {
            issues: [
              {
                message: "Expected title.",
                path: ["title"],
              },
            ],
          };
        },
      },
    };

    await expect(parseWithSchema(standardSchema, { title: "standard" })).resolves.toEqual({
      title: "standard",
    });
    await expect(parseWithSchema(standardSchema, { title: 1 })).rejects.toEqual([
      {
        message: "Expected title.",
        path: ["title"],
      },
    ]);
  });

  test("throws Standard Schema issues and invalid schema errors", async () => {
    const issueSchema: Schema<V1> = {
      "~standard": {
        version: 1,
        vendor: "tests",
        validate() {
          return {
            issues: [
              {
                message: "bad",
              },
            ],
          };
        },
      },
    };

    await expect(parseWithSchema(issueSchema, {})).rejects.toEqual([
      {
        message: "bad",
      },
    ]);
    await expect(parseWithSchema({} as Schema<V1>, {})).rejects.toThrow(TypeError);
  });

  test("preserves and wraps BecomesError instances", () => {
    const original = new BecomesError("Original", {
      code: "INVALID_PAYLOAD",
      documentType: "tests.error",
      version: 1,
      cause: new Error("cause"),
    });
    const wrapped = ensureBecomesError(new Error("plain"), {
      code: "INVALID_ENVELOPE",
      documentType: "tests.error",
      version: "x",
      message: "Wrapped",
    });

    expect(
      ensureBecomesError(original, {
        code: "INVALID_ENVELOPE",
        message: "Fallback",
      }),
    ).toBe(original);
    expect(wrapped.code).toBe("INVALID_ENVELOPE");
    expect(wrapped.documentType).toBe("tests.error");
    expect(wrapped.version).toBe("x");
    expect(wrapped.cause).toBeInstanceOf(Error);
    expect(new BecomesError("Bare", { code: "INVALID_ENVELOPE" }).code).toBe("INVALID_ENVELOPE");
  });
});

function objectSchema<T>(read: (record: Record<string, unknown>) => T): Schema<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "tests",
      validate(input) {
        try {
          if (typeof input !== "object" || input === null || Array.isArray(input)) {
            throw new Error("Expected object.");
          }

          return {
            value: read(input as Record<string, unknown>),
          };
        } catch (error) {
          return {
            issues: [
              {
                message: error instanceof Error ? error.message : "Invalid payload.",
              },
            ],
          };
        }
      },
    },
  };
}

function expectString(value: unknown, key: string): string {
  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Expected ${key} to be a string.`);
}

function expectNumber(value: unknown, key: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`Expected ${key} to be a number.`);
}

function expectBoolean(value: unknown, key: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error(`Expected ${key} to be a boolean.`);
}

async function expectDecodeInvalid(
  promise: Promise<DecodeResult<unknown, unknown>>,
  code: BecomesError["code"],
): Promise<BecomesError> {
  const result = await promise;

  expect(result.status).toBe("invalid");

  if (result.status !== "invalid") {
    throw new Error(`Expected invalid decode result with ${code}.`);
  }

  expect(result.error).toBeInstanceOf(BecomesError);
  expect(result.error.code).toBe(code);
  return result.error;
}

async function expectDecodeUnsupported(
  promise: Promise<DecodeResult<unknown, unknown>>,
): Promise<BecomesError> {
  const result = await promise;

  expect(result.status).toBe("unsupported-version");

  if (result.status !== "unsupported-version") {
    throw new Error("Expected unsupported-version decode result.");
  }

  expect(result.error).toBeInstanceOf(BecomesError);
  expect(result.error.code).toBe("UNSUPPORTED_VERSION");
  return result.error;
}

async function expectEncodeInvalid(
  promise: Promise<EncodeResult<unknown, unknown>>,
  code: BecomesError["code"],
): Promise<BecomesError> {
  const result = await promise;

  expect(result.status).toBe("invalid");

  if (result.status !== "invalid") {
    throw new Error(`Expected invalid encode result with ${code}.`);
  }

  expect(result.error).toBeInstanceOf(BecomesError);
  expect(result.error.code).toBe(code);
  return result.error;
}
