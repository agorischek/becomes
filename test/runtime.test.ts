import { describe, expect, test } from "bun:test";
import {
  BecomesError,
  defineDocument,
  parseWithSchema,
  schema,
  version,
  type Schema,
} from "../src/index.js";
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

const explicitHistory = version<1, typeof v1Schema, TestContext>(1, v1Schema)
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
  history: explicitHistory,
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
  test("opens latest-version documents without migration", async () => {
    await expect(
      TestDocument.open({
        type: "tests.note",
        version: 3,
        data: {
          title: "ready",
          count: 2,
          done: true,
        },
      }),
    ).resolves.toEqual({
      title: "ready",
      count: 2,
      done: true,
    });
  });

  test("opens older documents and migrates to latest", async () => {
    await expect(
      TestDocument.open({
        type: "tests.note",
        version: 1,
        data: {
          title: "old",
        },
      }),
    ).resolves.toEqual({
      title: "old",
      count: 1,
      done: false,
    });
  });

  test("uses operation context for async migrations", async () => {
    await expect(
      TestDocument.open(
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
      title: "middle",
      count: 5,
      done: true,
    });
  });

  test("validates payload before migration", async () => {
    const migrationCalls: string[] = [];
    const document = defineDocument({
      type: "tests.before",
      history: version(1, v1Schema).becomes(2, v2Schema, (value) => {
        migrationCalls.push(value.title);
        return {
          title: value.title,
          count: 1,
        };
      }),
    });

    const error = await expectRejectCode(
      document.open({
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
      history: version(1, v1Schema).becomes(
        2,
        v2Schema,
        () =>
          ({
            title: "bad",
            count: "wrong",
          }) as unknown as V2,
      ),
    });

    await expectRejectCode(
      document.open({
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
      history: version(1, v1Schema).becomes(
        2,
        v2Schema,
        () =>
          ({
            title: "unchecked",
            count: "also unchecked",
          }) as unknown as V2,
      ),
    });

    const skipped = await document.open(
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
      title: "unchecked",
      count: "also unchecked",
    });
  });

  test("rejects a missing or malformed envelope", async () => {
    await expectRejectCode(TestDocument.open(null), "INVALID_ENVELOPE");
    await expectRejectCode(TestDocument.open([]), "INVALID_ENVELOPE");
  });

  test("rejects the wrong document type", async () => {
    await expectRejectCode(
      TestDocument.open({
        type: "tests.other",
        version: 1,
        data: {
          title: "old",
        },
      }),
      "TYPE_MISMATCH",
    );
  });

  test("rejects a missing version", async () => {
    await expectRejectCode(
      TestDocument.open({
        type: "tests.note",
        data: {
          title: "old",
        },
      }),
      "MISSING_VERSION",
    );
  });

  test("rejects an unknown version", async () => {
    const error = await expectRejectCode(
      TestDocument.open({
        type: "tests.note",
        version: 99,
        data: {
          title: "future",
        },
      }),
      "UNSUPPORTED_VERSION",
    );

    expect(error.version).toBe("99");
  });

  test("rejects envelopes without data", async () => {
    await expectRejectCode(
      TestDocument.open({
        type: "tests.note",
        version: 1,
      }),
      "INVALID_ENVELOPE",
    );
  });

  test("rejects invalid latest payloads", async () => {
    await expectRejectCode(
      TestDocument.open({
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

  test("wraps thrown migration errors", async () => {
    const cause = new Error("boom");
    const document = defineDocument({
      type: "tests.throw",
      history: version(1, v1Schema).becomes(2, v2Schema, () => {
        throw cause;
      }),
    });

    const error = await expectRejectCode(
      document.open({
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

  test("saves latest payload with the correct envelope", () => {
    expect(
      TestDocument.save({
        title: "saved",
        count: 7,
        done: true,
      }),
    ).toEqual({
      type: "tests.note",
      version: 3,
      data: {
        title: "saved",
        count: 7,
        done: true,
      },
    });
  });

  test("can skip save validation", () => {
    expect(
      TestDocument.save(
        {
          title: "saved",
          count: "not checked",
          done: true,
        } as unknown as V3,
        {
          validate: false,
        },
      ) as unknown,
    ).toEqual({
      type: "tests.note",
      version: 3,
      data: {
        title: "saved",
        count: "not checked",
        done: true,
      },
    });
  });

  test("rejects invalid latest payloads on save and create", () => {
    expect(() =>
      TestDocument.save({
        title: "bad",
        count: Number.NaN,
        done: true,
      }),
    ).toThrow(BecomesError);

    const invalidCreate = defineDocument({
      type: "tests.invalid-create",
      history: version(1, v3Schema),
      create: () =>
        ({
          title: "bad",
        }) as V3,
    });

    expect(() => invalidCreate.create()).toThrow(BecomesError);
  });

  test("creates latest payloads and rejects missing create functions", () => {
    expect(TestDocument.create()).toEqual({
      title: "new",
      count: 0,
      done: false,
    });

    const document = defineDocument({
      type: "tests.no-create",
      history: version(1, v1Schema),
    });

    expect(() => document.create()).toThrow(BecomesError);
  });

  test("migrates and returns the latest envelope", async () => {
    await expect(
      TestDocument.migrate({
        type: "tests.note",
        version: 1,
        data: {
          title: "persisted",
        },
      }),
    ).resolves.toEqual({
      type: "tests.note",
      version: 3,
      data: {
        title: "persisted",
        count: 1,
        done: false,
      },
    });
  });

  test("validates without migration", () => {
    const document = defineDocument({
      type: "tests.validate",
      history: version(1, v1Schema).becomes(2, v2Schema, () => {
        throw new Error("validate should not migrate");
      }),
    });

    expect(
      document.validate({
        type: "tests.validate",
        version: 1,
        data: {
          title: "old",
        },
      }),
    ).toEqual({
      ok: true,
      type: "tests.validate",
      version: 1,
      latest: false,
    });

    const result = document.validate({
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
      history: version(1, v1Schema).becomes(2, v2Schema, () => {
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
      history: version(10, v1Schema).becomes(20, v2Schema, (value) => ({
        title: value.title,
        count: 20,
      })),
    });

    await expect(
      document.open({
        type: "tests.protocol",
        version: 10,
        data: {
          title: "old",
        },
      }),
    ).resolves.toEqual({
      title: "old",
      count: 20,
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
  });

  test("supports implicit positional version ids", async () => {
    const document = defineDocument({
      type: "tests.implicit",
      history: schema(v1Schema).becomes(v2Schema, (value) => ({
        title: value.title,
        count: 2,
      })),
    });

    expect(document.latestVersion).toBe(2);
    expect(
      await document.migrate({
        type: "tests.implicit",
        version: 1,
        data: {
          title: "old",
        },
      }),
    ).toEqual({
      type: "tests.implicit",
      version: 2,
      data: {
        title: "old",
        count: 2,
      },
    });
  });

  test("supports custom envelope keys", async () => {
    const document = defineDocument({
      type: "tests.custom",
      history: version(1, v1Schema),
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

    await expect(document.open(raw)).resolves.toEqual({
      title: "custom",
    });

    expect(
      document.save({
        title: "custom",
      }),
    ).toEqual(raw);
  });
});

describe("schema adapter and typed errors", () => {
  test("supports safeParse schemas", () => {
    const safeSchema: Schema<V1> = {
      safeParse(input) {
        try {
          return {
            success: true,
            data: parseWithSchema(v1Schema, input),
          };
        } catch (error) {
          return {
            success: false,
            error,
          };
        }
      },
    };

    expect(parseWithSchema(safeSchema, { title: "safe" })).toEqual({
      title: "safe",
    });
    expect(() => parseWithSchema(safeSchema, { title: 1 })).toThrow();
  });

  test("throws safeParse issues and invalid schema errors", () => {
    const issueSchema: Schema<V1> = {
      safeParse() {
        return {
          success: false,
          issues: ["bad"],
        };
      },
    };

    expect(() => parseWithSchema(issueSchema, {})).toThrow();
    expect(() => parseWithSchema({} as Schema<V1>, {})).toThrow(TypeError);
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
    parse(input) {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new Error("Expected object.");
      }

      return read(input as Record<string, unknown>);
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

async function expectRejectCode(
  promise: Promise<unknown>,
  code: BecomesError["code"],
): Promise<BecomesError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BecomesError);
    expect((error as BecomesError).code).toBe(code);
    return error as BecomesError;
  }

  throw new Error(`Expected rejection with ${code}.`);
}
