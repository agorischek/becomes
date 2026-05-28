import {
  defineDocument,
  version,
  type DecodeResult,
  type EncodeResult,
  type InferEnvelope,
  type InferLatest,
  type InferSchema,
  type InferVersion,
  type Schema,
  type StandardSchemaV1,
} from "../src/index.js";

type Expect<T extends true> = T;

type Equal<TLeft, TRight> =
  (<TValue>() => TValue extends TLeft ? 1 : 2) extends <TValue>() => TValue extends TRight ? 1 : 2
    ? true
    : false;

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

type Context = {
  doneDefault: boolean;
};

const v1Schema: Schema<V1> = {
  "~standard": {
    version: 1,
    vendor: "tests",
    validate(input) {
      return {
        value: input as V1,
      };
    },
  },
};

const v2Schema: Schema<V2> = {
  "~standard": {
    version: 1,
    vendor: "tests",
    validate(input) {
      return {
        value: input as V2,
      };
    },
  },
};

const v3Schema: Schema<V3> = {
  "~standard": {
    version: 1,
    vendor: "tests",
    validate(input) {
      return {
        value: input as V3,
      };
    },
  },
};

const standardV3Schema: StandardSchemaV1<unknown, V3> = {
  "~standard": {
    version: 1,
    vendor: "tests",
    validate(input) {
      return {
        value: input as V3,
      };
    },
  },
};

type _StandardSchemaInference = Expect<Equal<InferSchema<typeof standardV3Schema>, V3>>;

const explicitVersions = version<1, typeof v1Schema, Context>(1, v1Schema)
  .becomes(2, v2Schema, (value, context) => {
    type _Input = Expect<Equal<typeof value, V1>>;
    type _Context = Expect<Equal<typeof context, Context>>;

    return {
      title: value.title,
      count: context.doneDefault ? 1 : 0,
    };
  })
  .becomes(3, v3Schema, async (value) => {
    type _Input = Expect<Equal<typeof value, V2>>;

    return {
      ...value,
      done: true,
    };
  });

const ExplicitDocument = defineDocument({
  type: "tests.types",
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

type _Latest = Expect<Equal<InferLatest<typeof ExplicitDocument>, V3>>;
type _Version1 = Expect<Equal<InferVersion<typeof ExplicitDocument, 1>, V1>>;
type _Version2 = Expect<Equal<InferVersion<typeof ExplicitDocument, 2>, V2>>;

type ExpectedEnvelope =
  | {
      type: "tests.types";
      version: 1;
      data: V1;
    }
  | {
      type: "tests.types";
      version: 2;
      data: V2;
    }
  | {
      type: "tests.types";
      version: 3;
      data: V3;
    };

type _Envelope = Expect<Equal<InferEnvelope<typeof ExplicitDocument>, ExpectedEnvelope>>;
type _DecodeResult = Expect<
  Equal<
    ReturnType<typeof ExplicitDocument.decode>,
    Promise<DecodeResult<V3, Extract<ExpectedEnvelope, { version: 3 }>>>
  >
>;
type _EncodeResult = Expect<
  Equal<
    ReturnType<typeof ExplicitDocument.encode>,
    Promise<EncodeResult<V3, Extract<ExpectedEnvelope, { version: 3 }>>>
  >
>;
type _CreateReturn = Expect<Equal<ReturnType<typeof ExplicitDocument.create>, Promise<V3>>>;

const CreateArgsDocument = defineDocument({
  type: "tests.create-args-types",
  versions: version(1, v3Schema),
  create: (title: string, done: boolean) => ({
    title,
    count: title.length,
    done,
  }),
});

type _CreateArgs = Expect<Equal<Parameters<typeof CreateArgsDocument.create>, [string, boolean]>>;
type _CreateArgsReturn = Expect<Equal<ReturnType<typeof CreateArgsDocument.create>, Promise<V3>>>;

CreateArgsDocument.create("typed", true);
// @ts-expect-error create() requires the configured title argument.
CreateArgsDocument.create();
// @ts-expect-error create() requires a boolean second argument.
CreateArgsDocument.create("typed", "yes");

const NoCreateDocument = defineDocument({
  type: "tests.no-create-types",
  versions: version(1, v1Schema),
});

type _NoCreateKey = Expect<
  Equal<"create" extends keyof typeof NoCreateDocument ? true : false, false>
>;

// @ts-expect-error create() is omitted when no create factory is configured.
NoCreateDocument.create();

// @ts-expect-error migrate() is not part of the document boundary API.
ExplicitDocument.migrate({});

// @ts-expect-error defineDocument requires the versions option.
defineDocument({
  type: "tests.missing-versions-option",
});

version(1, v1Schema).becomes(
  2,
  v2Schema,
  // @ts-expect-error Migration output must satisfy V2.
  (value) => ({
    wrong: value.title,
  }),
);

version(1, v1Schema).becomes(
  2,
  v2Schema,
  // @ts-expect-error Migration input must be inferred as V1.
  (value: V2) => value,
);

version(1, v1Schema).becomes(
  2,
  v2Schema,
  // @ts-expect-error Async migration output must satisfy V2.
  async () => ({
    title: "bad",
  }),
);
