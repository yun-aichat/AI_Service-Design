const {
  BILLING_COLLECTIONS,
} = require("../server/infrastructure/cloudbase/billing/repository.cjs");
const {
  COLLECTIONS: BILLING_CONFIG_COLLECTIONS,
} = require("../server/application/billing-config.cjs");
const {
  COLLECTIONS: TOOL_DOCUMENT_COLLECTIONS,
} = require("../server/application/tool-documents.cjs");

const ACCEPTANCE_COLLECTIONS = Object.freeze([
  ...Object.values(BILLING_COLLECTIONS),
  ...Object.values(BILLING_CONFIG_COLLECTIONS),
  ...Object.values(TOOL_DOCUMENT_COLLECTIONS),
]);

async function routeAcceptanceApiRequest({
  request,
  response,
  viteMiddlewares,
  billingApiHandler,
  billingConfigApiHandler,
  toolDocumentsApiHandler,
  journeyChatApiHandler,
  ensureAcceptanceLedgerSeed,
}) {
  if (request.url === "/api/billing") {
    ensureAcceptanceLedgerSeed(request.headers.authorization);
    billingApiHandler(request, response);
    return true;
  }

  if (request.url === "/api/billing-config") {
    billingConfigApiHandler(request, response);
    return true;
  }

  if (request.url === "/api/tool-documents") {
    toolDocumentsApiHandler(request, response);
    return true;
  }

  if (request.url === "/api/journey-chat") {
    journeyChatApiHandler(request, response);
    return true;
  }

  viteMiddlewares(request, response);
  return false;
}

function createAcceptanceDatabase() {
  const stores = Object.fromEntries(
    ACCEPTANCE_COLLECTIONS.map((name) => [name, new Map()]),
  );

  return {
    stores,
    collection(name) {
      const store = stores[name];
      if (!store) throw new Error(`Unknown collection "${name}".`);
      return createCollection(store);
    },
  };
}

function createCollection(store) {
  return {
    async get() {
      return { data: [...store.values()].map(cloneJson) };
    },
    async count() {
      return { total: store.size, count: store.size };
    },
    async add(record) {
      const id = record?._id || record?.id;
      if (!id) throw new Error("Acceptance collection add() requires _id or id.");
      store.set(id, cloneJson({ ...record }));
      return { id };
    },
    doc(id) {
      return {
        async get() {
          return { data: store.has(id) ? cloneJson(store.get(id)) : null };
        },
        async set(value) {
          store.set(id, cloneJson(value));
          return { id };
        },
      };
    },
    where(query) {
      const matched = () =>
        [...store.values()].filter((record) =>
          Object.entries(query).every(([key, value]) => record?.[key] === value),
        );
      return createQuery(store, matched);
    },
    orderBy(field, direction) {
      return createQuery(store, () => [...store.values()]).orderBy(field, direction);
    },
    skip(value) {
      return createQuery(store, () => [...store.values()]).skip(value);
    },
    limit(value) {
      return createQuery(store, () => [...store.values()]).limit(value);
    },
  };
}

function createQuery(store, matched, state = {}) {
  const nextState = {
    orderByFields: state.orderByFields || [],
    skipValue: state.skipValue || 0,
    limitValue: state.limitValue ?? null,
  };

  return {
    orderBy(field, direction) {
      return createQuery(store, matched, {
        ...nextState,
        orderByFields: [...nextState.orderByFields, { field, direction }],
      });
    },
    skip(value) {
      return createQuery(store, matched, {
        ...nextState,
        skipValue: value,
      });
    },
    limit(value) {
      return createQuery(store, matched, {
        ...nextState,
        limitValue: value,
      });
    },
    async update(nextRecord) {
      const records = applyOrdering(matched(), nextState.orderByFields);
      const sliced = records.slice(
        nextState.skipValue,
        nextState.limitValue === null
          ? undefined
          : nextState.skipValue + nextState.limitValue,
      );

      for (const record of sliced) {
        const recordId = record?._id || record?.id;
        if (!recordId) continue;
        store.set(recordId, cloneJson({ ...record, ...nextRecord }));
      }

      return { updated: sliced.length };
    },
    async count() {
      const ordered = applyOrdering(matched(), nextState.orderByFields);
      const sliced = ordered.slice(
        nextState.skipValue,
        nextState.limitValue === null
          ? undefined
          : nextState.skipValue + nextState.limitValue,
      );
      return { total: sliced.length, count: sliced.length };
    },
    async get() {
      const ordered = applyOrdering(matched(), nextState.orderByFields);
      const sliced = ordered.slice(
        nextState.skipValue,
        nextState.limitValue === null
          ? undefined
          : nextState.skipValue + nextState.limitValue,
      );
      return { data: sliced.map(cloneJson) };
    },
  };
}

function applyOrdering(records, orderByFields) {
  if (!orderByFields.length) return records.map(cloneJson);
  return [...records].sort((left, right) => {
    for (const { field, direction } of orderByFields) {
      const leftValue = String(left?.[field] || "");
      const rightValue = String(right?.[field] || "");
      const comparison = leftValue.localeCompare(rightValue);
      if (comparison !== 0) {
        return direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ACCEPTANCE_COLLECTIONS,
  createAcceptanceDatabase,
  routeAcceptanceApiRequest,
};
