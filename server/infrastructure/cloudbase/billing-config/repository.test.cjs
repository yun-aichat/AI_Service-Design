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
    async update(record) {
      queryLog.push({ type: "update", record: cloneJson(record) });
      const matched = applyFakeQuery([...store.values()], nextState.query);
      if (matched.length !== 1) {
        return { updated: 0 };
      }
      const current = matched[0];
      store.set(current.id, cloneJson(record));
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


test("findActionPricingRecord returns the unique pricing record for toolKey and actionKey", async () => {
  const { repository } = createRepository({
    ai_action_pricing: {
      "journey-map:skeleton_generate:standard": {
        id: "journey-map:skeleton_generate:standard",
        pricingId: "journey-map:skeleton_generate:standard",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "standard",
        creditCost: 5,
        enabled: true,
        version: 2,
      },
    },
  });

  const record = await repository.findActionPricingRecord("journey-map", "skeleton_generate");

  assert.equal(record.pricingId, "journey-map:skeleton_generate:standard");
  assert.equal(record.version, 2);
});

test("findActionPricingRecord rejects ambiguous toolKey and actionKey matches", async () => {
  const { repository } = createRepository({
    ai_action_pricing: {
      "journey-map:skeleton_generate:standard": {
        id: "journey-map:skeleton_generate:standard",
        pricingId: "journey-map:skeleton_generate:standard",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "standard",
        creditCost: 5,
        enabled: true,
        version: 2,
      },
      "journey-map:skeleton_generate:deep": {
        id: "journey-map:skeleton_generate:deep",
        pricingId: "journey-map:skeleton_generate:deep",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "deep",
        creditCost: 8,
        enabled: true,
        version: 1,
      },
    },
  });

  await assert.rejects(
    () => repository.findActionPricingRecord("journey-map", "skeleton_generate"),
    /Multiple action pricing records matched toolKey\/actionKey/,
  );
});

test("updateActionPricingRecordIfVersion persists the next version only when expectedVersion matches", async () => {
  const { repository, stores } = createRepository({
    ai_action_pricing: {
      "journey-map:skeleton_generate:standard": {
        id: "journey-map:skeleton_generate:standard",
        pricingId: "journey-map:skeleton_generate:standard",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "standard",
        creditCost: 5,
        enabled: true,
        version: 2,
      },
    },
  });

  const updated = await repository.updateActionPricingRecordIfVersion(
    "journey-map:skeleton_generate:standard",
    2,
    {
      id: "journey-map:skeleton_generate:standard",
      pricingId: "journey-map:skeleton_generate:standard",
      toolKey: "journey-map",
      actionKey: "skeleton_generate",
      tierKey: "standard",
      creditCost: 8,
      enabled: false,
      version: 3,
    },
  );

  assert.equal(updated, true);
  assert.equal(stores.ai_action_pricing.get("journey-map:skeleton_generate:standard").creditCost, 8);
  assert.equal(stores.ai_action_pricing.get("journey-map:skeleton_generate:standard").version, 3);

  const stale = await repository.updateActionPricingRecordIfVersion(
    "journey-map:skeleton_generate:standard",
    2,
    {
      id: "journey-map:skeleton_generate:standard",
      pricingId: "journey-map:skeleton_generate:standard",
      toolKey: "journey-map",
      actionKey: "skeleton_generate",
      tierKey: "standard",
      creditCost: 9,
      enabled: true,
      version: 4,
    },
  );

  assert.equal(stale, false);
  assert.equal(stores.ai_action_pricing.get("journey-map:skeleton_generate:standard").creditCost, 8);
  assert.equal(stores.ai_action_pricing.get("journey-map:skeleton_generate:standard").version, 3);
});
