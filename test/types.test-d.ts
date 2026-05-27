import {
  defineDocument,
  schema,
  version,
  type InferEnvelope,
  type InferLatest,
  type InferVersion,
  type Schema,
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
  parse(input) {
    return input as V1;
  },
};

const v2Schema: Schema<V2> = {
  parse(input) {
    return input as V2;
  },
};

const v3Schema: Schema<V3> = {
  parse(input) {
    return input as V3;
  },
};

const explicitHistory = version<1, typeof v1Schema, Context>(1, v1Schema)
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

const ImplicitDocument = defineDocument({
  type: "tests.implicit-types",
  history: schema(v1Schema)
    .becomes(v2Schema, (value) => ({
      title: value.title,
      count: 1,
    }))
    .becomes(v3Schema, (value) => ({
      ...value,
      done: false,
    })),
});

type _ExplicitImplicitLatest = Expect<
  Equal<InferLatest<typeof ExplicitDocument>, InferLatest<typeof ImplicitDocument>>
>;

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
