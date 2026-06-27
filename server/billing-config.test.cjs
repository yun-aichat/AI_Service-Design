const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const {
  handleBillingConfig,
} = require("./billing-config.cjs");

test("handleBillingConfig routes listJourneyRunAuditRecords through the formal host", async () => {
  const previousFetch = global.fetch;
  const previousDatabase = globalThis.__cloudbaseDatabase;
  const previousFallback = process.env.PERSISTENCE_ALLOW_UNVERIFIED_BEARER;

  global.fetch = async () => new Response(null, { status: 401 });
  process.env.PERSISTENCE_ALLOW_UNVERIFIED_BEARER = "1";
  globalThis.__cloudbaseDatabase = createFakeDatabase({
    ai_usage_events: {
      "usage-1": {
        id: "usage-1",
        runId: "journey-run-1",
        userId: "user-admin",
        projectId: "project-1",
        documentId: "doc-1",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        providerKey: "openai",
        modelKey: "gpt-5-mini",
        provider: "openai",
        model: "gpt-5-mini",
        endpoint: "https://api.openai.com/v1",
        conversationId: "conversation-1",
        chargedCredits: 15,
        status: "succeeded",
        referenceId: "ai_run:journey-run-1",
        createdAt: "2026-06-14T00:00:02.000Z",
      },
    },
  });

  const token = createJwt({ sub: "user-admin", role: ["billing-admin"] });
  const request = createJsonRequest(
    {
      action: "listJourneyRunAuditRecords",
      providerKey: "openai",
      conversationId: "conversation-1",
      limit: 10,
      offset: 0,
    },
    token,
  );

  try {
    const result = await handleBillingConfig(request);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].runId, "journey-run-1");
    assert.equal(result.items[0].providerKey, "openai");
    assert.equal(result.page.total, 1);
  } finally {
    global.fetch = previousFetch;
    globalThis.__cloudbaseDatabase = previousDatabase;
    if (previousFallback === undefined) delete process.env.PERSISTENCE_ALLOW_UNVERIFIED_BEARER;
    else process.env.PERSISTENCE_ALLOW_UNVERIFIED_BEARER = previousFallback;
  }
});

function createJsonRequest(body, token) {
  const request = new EventEmitter();
  request.headers = {
    authorization: `Bearer ${token}`,
  };
  let sent = false;
  const baseOn = request.on.bind(request);
  request.on = (event, listener) => {
    const result = baseOn(event, listener);
    if (event === "end" && !sent) {
      sent = true;
      setImmediate(() => {
        request.emit("data", Buffer.from(JSON.stringify(body)));
        request.emit("end");
      });
    }
    return result;
  };
  return request;
}

function createJwt(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `header.${encoded}.signature`;
}

function createFakeDatabase(seed = {}) {
  const stores = {
    credit_packages: new Map(Object.entries(seed.credit_packages || {})),
    ai_action_pricing: new Map(Object.entries(seed.ai_action_pricing || {})),
    ai_model_policies: new Map(Object.entries(seed.ai_model_policies || {})),
    credit_ledger: new Map(Object.entries(seed.credit_ledger || {})),
    ai_usage_events: new Map(Object.entries(seed.ai_usage_events || {})),
  };

  return {
    command: null,
    collection(name) {
      const store = stores[name];
      if (!store) throw new Error(`Unknown collection \"${name}\".`);
      return createFakeCollection(store);
    },
  };
}

function createFakeCollection(store) {
  return {
    doc(id) {
      return {
        async get() {
          return { data: store.has(id) ? cloneJson(store.get(id)) : null };
        },
      };
    },
    where(query) {
      return createFakeQuery(store, query);
    },
    orderBy(field, direction) {
      return createFakeQuery(store, {}, { field, direction });
    },
    skip(value) {
      return createFakeQuery(store, {}, { skipValue: value });
    },
    limit(value) {
      return createFakeQuery(store, {}, { limitValue: value });
    },
  };
}

function createFakeQuery(store, query = {}, state = {}) {
  const nextState = {
    query,
    orderByField: state.field || state.orderByField || null,
    orderDirection: state.direction || state.orderDirection || "asc",
    skipValue: state.skipValue || 0,
    limitValue: state.limitValue ?? null,
  };

  return {
    where(nextQuery) {
      return createFakeQuery(store, nextQuery, nextState);
    },
    orderBy(field, direction) {
      return createFakeQuery(store, nextState.query, {
        ...nextState,
        orderByField: field,
        orderDirection: direction,
      });
    },
    skip(value) {
      return createFakeQuery(store, nextState.query, {
        ...nextState,
        skipValue: value,
      });
    },
    limit(value) {
      return createFakeQuery(store, nextState.query, {
        ...nextState,
        limitValue: value,
      });
    },
    async get() {
      const filtered = applyQuery([...store.values()], nextState.query);
      const ordered = applyOrder(filtered, nextState.orderByField, nextState.orderDirection);
      const sliced = ordered.slice(
        nextState.skipValue,
        nextState.limitValue === null ? undefined : nextState.skipValue + nextState.limitValue,
      );
      return { data: sliced.map((entry) => cloneJson(entry)) };
    },
    async count() {
      return { total: applyQuery([...store.values()], nextState.query).length };
    },
  };
}

function applyQuery(records, query) {
  return records.filter((entry) =>
    Object.entries(query).every(([key, value]) => entry?.[key] === value),
  );
}

function applyOrder(records, field, direction) {
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
