const assert = require("node:assert/strict");
const test = require("node:test");

const { CloudBaseBillingConfigRepository } = require("./repository.cjs");

test("listRecords returns filtered billing config data from the target collection", async () => {
  const { repository } = createRepository({
    credit_packages: {
      "starter-100": {
        id: "starter-100",
        packageId: "starter-100",
        enabled: true,
        currency: "CNY",
      },
      "pro-1000": {
        id: "pro-1000",
        packageId: "pro-1000",
        enabled: false,
        currency: "CNY",
      },
    },
  });

  const active = await repository.listRecords("credit_packages", {
    filters: { enabled: true },
  });

  assert.equal(active.total, 1);
  assert.equal(active.items.length, 1);
  assert.equal(active.items[0].packageId, "starter-100");
});

test("listRecords pushes filter, sort, range, offset, and limit to the collection query path", async () => {
  const { repository, queryLog } = createRepository({
    credit_ledger: {
      "ledger-1": {
        id: "ledger-1",
        accountId: "acct-1",
        operation: "purchase",
        createdAt: "2026-06-14T00:00:00.000Z",
      },
      "ledger-2": {
        id: "ledger-2",
        accountId: "acct-1",
        operation: "grant",
        createdAt: "2026-06-13T00:00:00.000Z",
      },
      "ledger-3": {
        id: "ledger-3",
        accountId: "acct-2",
        operation: "purchase",
        createdAt: "2026-06-12T00:00:00.000Z",
      },
    },
  });

  const result = await repository.listRecords("credit_ledger", {
    filters: { accountId: "acct-1" },
    createdFrom: "2026-06-13T00:00:00.000Z",
    createdTo: "2026-06-14T23:59:59.000Z",
    sortBy: "createdAt",
    sortDirection: "desc",
    offset: 1,
    limit: 1,
  });

  assert.equal(result.total, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "ledger-2");
  assert.deepEqual(queryLog[0], {
    type: "where",
    query: {
      accountId: "acct-1",
      createdAt: {
        __billingRange: true,
        gte: "2026-06-13T00:00:00.000Z",
        lte: "2026-06-14T23:59:59.000Z",
      },
    },
  });
  assert.deepEqual(queryLog.slice(1), [
    { type: "orderBy", field: "createdAt", direction: "desc" },
    { type: "skip", value: 1 },
    { type: "limit", value: 1 },
    { type: "get" },
    {
      type: "where",
      query: {
        accountId: "acct-1",
        createdAt: {
          __billingRange: true,
          gte: "2026-06-13T00:00:00.000Z",
          lte: "2026-06-14T23:59:59.000Z",
        },
      },
    },
    { type: "count" },
  ]);
});

test("listRecords uses command pushdown when gte, lte, and and all exist", async () => {
  const { repository, queryLog, command } = createRepository(
    {
      credit_ledger: {
        "ledger-1": {
          id: "ledger-1",
          accountId: "acct-1",
          createdAt: "2026-06-14T00:00:00.000Z",
        },
      },
    },
    {
      command: createFakeCommand({ includeAnd: true }),
    },
  );

  await repository.listRecords("credit_ledger", {
    filters: { accountId: "acct-1" },
    createdFrom: "2026-06-13T00:00:00.000Z",
    createdTo: "2026-06-14T23:59:59.000Z",
  });

  assert.deepEqual(queryLog[0], {
    type: "where",
    query: {
      accountId: "acct-1",
      createdAt: {
        __op: "and",
        value: [
          { __op: "gte", value: "2026-06-13T00:00:00.000Z" },
          { __op: "lte", value: "2026-06-14T23:59:59.000Z" },
        ],
      },
    },
  });
  assert.equal(command.calls.gte.length, 1);
  assert.equal(command.calls.lte.length, 1);
  assert.equal(command.calls.and.length, 1);
});

test("listRecords falls back safely when gte and lte exist but and is missing", async () => {
  const { repository, queryLog, command } = createRepository(
    {
      credit_ledger: {
        "ledger-1": {
          id: "ledger-1",
          accountId: "acct-1",
          createdAt: "2026-06-14T00:00:00.000Z",
        },
      },
    },
    {
      command: createFakeCommand({ includeAnd: false }),
    },
  );

  await repository.listRecords("credit_ledger", {
    filters: { accountId: "acct-1" },
    createdFrom: "2026-06-13T00:00:00.000Z",
    createdTo: "2026-06-14T23:59:59.000Z",
  });

  assert.deepEqual(queryLog[0], {
    type: "where",
    query: {
      accountId: "acct-1",
      createdAt: {
        __billingRange: true,
        gte: "2026-06-13T00:00:00.000Z",
        lte: "2026-06-14T23:59:59.000Z",
      },
    },
  });
  assert.equal(command.calls.gte.length, 0);
  assert.equal(command.calls.lte.length, 0);
});

test("listRecords keeps single-boundary createdAt filters working without command.and", async () => {
  const { repository, queryLog, command } = createRepository(
    {
      credit_ledger: {
        "ledger-1": {
          id: "ledger-1",
          accountId: "acct-1",
          createdAt: "2026-06-14T00:00:00.000Z",
        },
      },
    },
    {
      command: createFakeCommand({ includeAnd: false }),
    },
  );

  await repository.listRecords("credit_ledger", {
    filters: { accountId: "acct-1" },
    createdFrom: "2026-06-13T00:00:00.000Z",
  });
  await repository.listRecords("credit_ledger", {
    filters: { accountId: "acct-1" },
    createdTo: "2026-06-14T23:59:59.000Z",
  });

  const whereEntries = queryLog.filter((entry) => entry.type === "where");
  assert.deepEqual(queryLog[0], {
    type: "where",
    query: {
      accountId: "acct-1",
      createdAt: { __op: "gte", value: "2026-06-13T00:00:00.000Z" },
    },
  });
  assert.deepEqual(whereEntries.at(-1), {
    type: "where",
    query: {
      accountId: "acct-1",
      createdAt: { __op: "lte", value: "2026-06-14T23:59:59.000Z" },
    },
  });
  assert.equal(command.calls.gte.length, 1);
  assert.equal(command.calls.lte.length, 1);
});

test("upsertRecord overwrites the same billing config id instead of duplicating it", async () => {
  const { repository, stores } = createRepository();

  await repository.upsertRecord("ai_action_pricing", "journey:proposal:standard", {
    id: "journey:proposal:standard",
    pricingId: "journey:proposal:standard",
    creditCost: 15,
  });
  await repository.upsertRecord("ai_action_pricing", "journey:proposal:standard", {
    id: "journey:proposal:standard",
    pricingId: "journey:proposal:standard",
    creditCost: 20,
  });

  assert.equal(stores.ai_action_pricing.size, 1);
  assert.equal(stores.ai_action_pricing.get("journey:proposal:standard").creditCost, 20);
});

test("listRecords filters ai_usage_events by formal journey audit fields", async () => {
  const { repository } = createRepository({
    ai_usage_events: {
      "usage-1": {
        id: "usage-1",
        runId: "journey-run-1",
        actionKey: "proposal",
        providerKey: "openai",
        modelKey: "gpt-5-mini",
        conversationId: "conversation-1",
        status: "succeeded",
        referenceId: "ai_run:journey-run-1",
        createdAt: "2026-06-14T00:00:02.000Z",
      },
      "usage-2": {
        id: "usage-2",
        runId: "journey-run-2",
        actionKey: "proposal",
        providerKey: "glm",
        modelKey: "glm-4.6",
        conversationId: "conversation-2",
        status: "failed",
        referenceId: "ai_run:journey-run-2",
        createdAt: "2026-06-14T00:00:01.000Z",
      },
    },
  });

  const result = await repository.listRecords("ai_usage_events", {
    filters: {
      providerKey: "openai",
      conversationId: "conversation-1",
      status: "succeeded",
    },
    sortBy: "createdAt",
    sortDirection: "desc",
    limit: 10,
    offset: 0,
  });

  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "usage-1");
});

test("saveRecordWithVersion creates and updates a model policy with optimistic concurrency", async () => {
  const { repository, stores } = createRepository();

  const created = await repository.saveRecordWithVersion(
    "ai_model_policies",
    "journey-map:proposal",
    0,
    {
      id: "journey-map:proposal",
      policyId: "journey-map:proposal",
      toolKey: "journey-map",
      actionKey: "proposal",
      providerKey: "glm",
      modelKey: "glm-4.6",
      apiKeyRef: "secrets/glm/default",
      version: 1,
    },
  );
  const staleCreate = await repository.saveRecordWithVersion(
    "ai_model_policies",
    "journey-map:proposal",
    0,
    {
      id: "journey-map:proposal",
      policyId: "journey-map:proposal",
      toolKey: "journey-map",
      actionKey: "proposal",
      providerKey: "openai",
      modelKey: "gpt-5-mini",
      apiKeyRef: "secrets/openai/default",
      version: 1,
    },
  );
  const updated = await repository.saveRecordWithVersion(
    "ai_model_policies",
    "journey-map:proposal",
    1,
    {
      id: "journey-map:proposal",
      policyId: "journey-map:proposal",
      toolKey: "journey-map",
      actionKey: "proposal",
      providerKey: "openai",
      modelKey: "gpt-5-mini",
      apiKeyRef: "secrets/openai/default",
      version: 2,
    },
  );
  const conflict = await repository.saveRecordWithVersion(
    "ai_model_policies",
    "journey-map:proposal",
    1,
    {
      id: "journey-map:proposal",
      policyId: "journey-map:proposal",
      toolKey: "journey-map",
      actionKey: "proposal",
      providerKey: "openai",
      modelKey: "gpt-5",
      apiKeyRef: "secrets/openai/default",
      version: 3,
    },
  );

  assert.equal(created, true);
  assert.equal(staleCreate, false);
  assert.equal(updated, true);
  assert.equal(conflict, false);
  assert.equal(stores.ai_model_policies.size, 1);
  assert.equal(stores.ai_model_policies.get("journey-map:proposal").modelKey, "gpt-5-mini");
  assert.equal(stores.ai_model_policies.get("journey-map:proposal").version, 2);
});

function createRepository(seed = {}, options = {}) {
  const database = createFakeDatabase(seed, options);
  return {
    repository: new CloudBaseBillingConfigRepository(database),
    stores: database.stores,
    queryLog: database.queryLog,
    command: database.command,
  };
}

function createFakeDatabase(seed = {}, options = {}) {
  const stores = {
    credit_packages: new Map(
      Object.entries(seed.credit_packages || {}).map(([id, value]) => [id, cloneJson(value)]),
    ),
    ai_action_pricing: new Map(
      Object.entries(seed.ai_action_pricing || {}).map(([id, value]) => [id, cloneJson(value)]),
    ),
    ai_model_policies: new Map(
      Object.entries(seed.ai_model_policies || {}).map(([id, value]) => [id, cloneJson(value)]),
    ),
    credit_ledger: new Map(
      Object.entries(seed.credit_ledger || {}).map(([id, value]) => [id, cloneJson(value)]),
    ),
    ai_usage_events: new Map(
      Object.entries(seed.ai_usage_events || {}).map(([id, value]) => [id, cloneJson(value)]),
    ),
  };

  const queryLog = [];
  const command = options.command || null;

  return {
    stores,
    queryLog,
    command,
    collection(name) {
      const store = stores[name];
      if (!store) throw new Error(`Unknown collection "${name}".`);
      return createFakeCollection(store, queryLog);
    },
  };
}

function createFakeCollection(store, queryLog) {
  return {
    async get() {
      queryLog.push({ type: "get" });
      return { data: [...store.values()].map((entry) => cloneJson(entry)) };
    },
    async count() {
      queryLog.push({ type: "count" });
      return { total: store.size };
    },
    doc(id) {
      return {
        async get() {
          return { data: store.has(id) ? cloneJson(store.get(id)) : null };
        },
        async set(record) {
          store.set(id, cloneJson(record));
          return { id };
        },
      };
    },
    async add(record) {
      const id = record?._id;
      if (!id) throw new Error("_id is required.");
      if (store.has(id)) {
        const error = new Error(`Duplicate key ${id}`);
        error.code = "duplicate";
        throw error;
      }
      const next = cloneJson(record);
      delete next._id;
      store.set(id, next);
      return { id };
    },
    where(query) {
      queryLog.push({ type: "where", query: cloneJson(query) });
      return createFakeQuery(store, queryLog, query);
    },
    orderBy(field, direction) {
      return createFakeQuery(store, queryLog).orderBy(field, direction);
    },
    skip(value) {
      return createFakeQuery(store, queryLog).skip(value);
    },
    limit(value) {
      return createFakeQuery(store, queryLog).limit(value);
    },
  };
}

function createFakeQuery(store, queryLog, query = {}, state = {}) {
  const nextState = {
    query,
    orderByField: state.orderByField || null,
    orderDirection: state.orderDirection || "asc",
    skipValue: state.skipValue || 0,
    limitValue: state.limitValue || null,
  };

  return {
    where(nextQuery) {
      queryLog.push({ type: "where", query: cloneJson(nextQuery) });
      return createFakeQuery(store, queryLog, nextQuery, nextState);
    },
    orderBy(field, direction) {
      queryLog.push({ type: "orderBy", field, direction });
      return createFakeQuery(store, queryLog, nextState.query, {
        ...nextState,
        orderByField: field,
        orderDirection: direction,
      });
    },
    skip(value) {
      queryLog.push({ type: "skip", value });
      return createFakeQuery(store, queryLog, nextState.query, {
        ...nextState,
        skipValue: value,
      });
    },
    limit(value) {
      queryLog.push({ type: "limit", value });
      return createFakeQuery(store, queryLog, nextState.query, {
        ...nextState,
        limitValue: value,
      });
    },
    async get() {
      queryLog.push({ type: "get" });
      const filtered = applyFakeQuery([...store.values()], nextState.query);
      const ordered = applyFakeOrdering(filtered, nextState.orderByField, nextState.orderDirection);
      const sliced = ordered.slice(
        nextState.skipValue,
        nextState.limitValue === null
          ? undefined
          : nextState.skipValue + nextState.limitValue,
      );
      return { data: sliced.map((entry) => cloneJson(entry)) };
    },
    async count() {
      queryLog.push({ type: "count" });
      return { total: applyFakeQuery([...store.values()], nextState.query).length };
    },
    async update(nextRecord) {
      queryLog.push({ type: "update", record: cloneJson(nextRecord) });
      const matches = applyFakeQuery([...store.entries()].map(([id, value]) => ({ _key: id, ...value })), nextState.query);
      if (matches.length !== 1) return { updated: 0 };
      const match = matches[0];
      const record = cloneJson(nextRecord);
      delete record._key;
      store.set(match._key, record);
      return { updated: 1 };
    },
  };
}

function applyFakeQuery(records, query) {
  return records.filter((entry) =>
    Object.entries(query).every(([key, value]) => {
      if (value?.__billingRange) {
        const current = String(entry?.[key] || "");
        if (value.gte && current < value.gte) return false;
        if (value.lte && current > value.lte) return false;
        return true;
      }
      if (value?.__op === "gte") {
        return String(entry?.[key] || "") >= value.value;
      }
      if (value?.__op === "lte") {
        return String(entry?.[key] || "") <= value.value;
      }
      if (value?.__op === "and") {
        return value.value.every((item) => applyFakeQuery([entry], { [key]: item }).length === 1);
      }
      return entry?.[key] === value;
    }),
  );
}

function createFakeCommand({ includeAnd }) {
  const calls = {
    gte: [],
    lte: [],
    and: [],
  };

  const command = {
    calls,
    gte(value) {
      calls.gte.push(value);
      return { __op: "gte", value };
    },
    lte(value) {
      calls.lte.push(value);
      return { __op: "lte", value };
    },
  };

  if (includeAnd) {
    command.and = function and(value) {
      calls.and.push(cloneJson(value));
      return { __op: "and", value };
    };
  }

  return command;
}

function applyFakeOrdering(records, field, direction) {
  if (!field) return records;
  const modifier = direction === "asc" ? 1 : -1;
  return [...records].sort((left, right) => {
    const leftValue = String(left?.[field] ?? "");
    const rightValue = String(right?.[field] ?? "");
    if (leftValue === rightValue) return 0;
    return leftValue < rightValue ? -1 * modifier : 1 * modifier;
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
