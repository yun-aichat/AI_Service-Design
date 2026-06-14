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

  const active = await repository.listRecords("credit_packages", { enabled: true });

  assert.equal(active.length, 1);
  assert.equal(active[0].packageId, "starter-100");
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

function createRepository(seed = {}) {
  const database = createFakeDatabase(seed);
  return {
    repository: new CloudBaseBillingConfigRepository(database),
    stores: database.stores,
  };
}

function createFakeDatabase(seed = {}) {
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

  return {
    stores,
    collection(name) {
      const store = stores[name];
      if (!store) throw new Error(`Unknown collection "${name}".`);
      return createFakeCollection(store);
    },
  };
}

function createFakeCollection(store) {
  return {
    async get() {
      return { data: [...store.values()].map((entry) => cloneJson(entry)) };
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
      const matched = [...store.values()].filter((entry) =>
        Object.entries(query).every(([key, value]) => entry?.[key] === value),
      );
      return {
        async get() {
          return { data: matched.map((entry) => cloneJson(entry)) };
        },
      };
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
