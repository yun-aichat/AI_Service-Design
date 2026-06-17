const http = require("node:http");
const { createServer: createViteServer } = require("vite");
const billingApiHandler = require("../api/billing.js");
const {
  BILLING_COLLECTIONS,
} = require("../server/infrastructure/cloudbase/billing/repository.cjs");

const HOST = process.env.BILLING_ACCEPTANCE_HOST || "127.0.0.1";
const PORT = Number(process.env.BILLING_ACCEPTANCE_PORT || 4173);
const seededAccounts = new Set();
const database = createAcceptanceDatabase();

globalThis.__cloudbaseDatabase = database;

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function start() {
  seedCreditPackages(database.stores);

  const vite = await createViteServer({
    appType: "spa",
    server: {
      host: HOST,
      middlewareMode: true,
    },
  });

  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === "/api/billing") {
        ensureAcceptanceLedgerSeed(request.headers.authorization);
        billingApiHandler(request, response);
        return;
      }
      vite.middlewares(request, response);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Acceptance host failed.",
        code: "ACCEPTANCE_HOST_ERROR",
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });

  const stop = async () => {
    delete globalThis.__cloudbaseDatabase;
    await vite.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(
    `Billing acceptance host running at http://${HOST}:${PORT}/billing using formal api/billing.js`,
  );
}

function ensureAcceptanceLedgerSeed(authorization) {
  const accountId = decodeAccountIdFromAuthorization(authorization);
  if (!accountId || seededAccounts.has(accountId)) return;

  const ledgerStore = database.stores[BILLING_COLLECTIONS.ledgerEntries];
  for (const entry of buildLedgerEntriesForUser(accountId)) {
    ledgerStore.set(entry.id, cloneJson(entry));
  }
  seededAccounts.add(accountId);
}

function seedCreditPackages(stores) {
  const packageStore = stores[BILLING_COLLECTIONS.creditPackages];
  const packages = [
    {
      id: "starter-100",
      packageId: "starter-100",
      displayName: "Starter 100",
      credits: 100,
      bonusCredits: 0,
      totalCredits: 100,
      priceValue: 990,
      currency: "CNY",
      enabled: true,
      validityDays: null,
      channelScope: null,
      description: "适合首次体验积分功能。",
      sortOrder: 10,
      createdAt: "2026-06-16T09:00:00.000Z",
      updatedAt: "2026-06-16T09:00:00.000Z",
    },
    {
      id: "pro-500",
      packageId: "pro-500",
      displayName: "Pro 500",
      credits: 500,
      bonusCredits: 50,
      totalCredits: 550,
      priceValue: 3990,
      currency: "CNY",
      enabled: true,
      validityDays: null,
      channelScope: null,
      description: "恢复后的用户侧套餐列表验收用数据。",
      sortOrder: 20,
      createdAt: "2026-06-16T09:05:00.000Z",
      updatedAt: "2026-06-16T09:05:00.000Z",
    },
    {
      id: "archived-1000",
      packageId: "archived-1000",
      displayName: "Archived 1000",
      credits: 1000,
      bonusCredits: 100,
      totalCredits: 1100,
      priceValue: 7990,
      currency: "CNY",
      enabled: false,
      validityDays: null,
      channelScope: null,
      description: "已下架套餐不会出现在默认列表。",
      sortOrder: 30,
      createdAt: "2026-06-16T09:10:00.000Z",
      updatedAt: "2026-06-16T09:10:00.000Z",
    },
  ];

  for (const record of packages) {
    packageStore.set(record.packageId, cloneJson(record));
  }
}

function buildLedgerEntriesForUser(accountId) {
  const primaryEntries = [
    makeLedgerEntry({
      id: `ledger-${accountId}-001`,
      accountId,
      operation: "purchase",
      referenceType: "order",
      referenceId: "order:starter-1",
      credits: 120,
      availableDelta: 120,
      createdAt: "2026-06-16T09:00:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-002`,
      accountId,
      operation: "grant",
      referenceType: "admin",
      referenceId: "admin:welcome",
      credits: 30,
      availableDelta: 30,
      createdAt: "2026-06-16T09:10:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-003`,
      accountId,
      operation: "reserve",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-1",
      credits: 12,
      availableDelta: -12,
      reservedDelta: 12,
      createdAt: "2026-06-16T09:20:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-004`,
      accountId,
      operation: "commit",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-1",
      credits: 12,
      reservedDelta: -12,
      consumedDelta: 12,
      createdAt: "2026-06-16T09:30:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-005`,
      accountId,
      operation: "purchase",
      referenceType: "order",
      referenceId: "order:pro-1",
      credits: 200,
      availableDelta: 200,
      createdAt: "2026-06-16T09:40:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-006`,
      accountId,
      operation: "reserve",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-2",
      credits: 20,
      availableDelta: -20,
      reservedDelta: 20,
      createdAt: "2026-06-16T09:50:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-007`,
      accountId,
      operation: "release",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-2",
      credits: 20,
      availableDelta: 20,
      reservedDelta: -20,
      createdAt: "2026-06-16T10:00:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-008`,
      accountId,
      operation: "adjustment",
      referenceType: "admin",
      referenceId: "admin:reconcile",
      credits: 8,
      availableDelta: 8,
      createdAt: "2026-06-16T10:10:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-009`,
      accountId,
      operation: "expire",
      referenceType: "admin",
      referenceId: "admin:expiry",
      credits: 5,
      availableDelta: -5,
      createdAt: "2026-06-16T10:20:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-010`,
      accountId,
      operation: "purchase",
      referenceType: "order",
      referenceId: "order:topup-3",
      credits: 60,
      availableDelta: 60,
      createdAt: "2026-06-16T10:30:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-011`,
      accountId,
      operation: "commit",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-3",
      credits: 18,
      consumedDelta: 18,
      createdAt: "2026-06-16T10:40:00.000Z",
    }),
    makeLedgerEntry({
      id: `ledger-${accountId}-012`,
      accountId,
      operation: "refund",
      referenceType: "refund",
      referenceId: "refund:order-7",
      credits: 15,
      availableDelta: 15,
      createdAt: "2026-06-16T10:50:00.000Z",
    }),
  ];

  const otherAccountEntries = [
    makeLedgerEntry({
      id: `other-${accountId}-001`,
      accountId: `other-${accountId}`,
      operation: "purchase",
      referenceType: "order",
      referenceId: "order:other-1",
      credits: 999,
      availableDelta: 999,
      createdAt: "2026-06-16T10:55:00.000Z",
    }),
  ];

  return [...primaryEntries, ...otherAccountEntries];
}

function makeLedgerEntry(overrides) {
  return {
    id: overrides.id,
    accountId: overrides.accountId,
    orderId:
      overrides.referenceType === "order"
        ? overrides.referenceId.split(":")[1]
        : null,
    reservationId:
      overrides.referenceType === "ai_run"
        ? overrides.referenceId.split(":")[1]
        : null,
    referenceType: overrides.referenceType,
    referenceId: overrides.referenceId,
    idempotencyKey: `${overrides.operation}:${overrides.referenceId}:${overrides.id}`,
    operation: overrides.operation,
    credits: overrides.credits,
    availableDelta: overrides.availableDelta || 0,
    reservedDelta: overrides.reservedDelta || 0,
    consumedDelta: overrides.consumedDelta || 0,
    metadata: null,
    createdAt: overrides.createdAt,
  };
}

function decodeAccountIdFromAuthorization(authorization) {
  const match =
    typeof authorization === "string"
      ? authorization.match(/^Bearer\s+(.+)$/i)
      : null;
  if (!match?.[1]) return null;
  const payload = decodeJwtPayload(match[1]);
  const accountId = payload?.user_id || payload?.sub;
  return typeof accountId === "string" && accountId ? accountId : null;
}

function decodeJwtPayload(token) {
  try {
    const segments = String(token || "").split(".");
    if (segments.length < 2) return null;
    const payload = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized = payload.padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "=",
    );
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function createAcceptanceDatabase() {
  const stores = Object.fromEntries(
    Object.values(BILLING_COLLECTIONS).map((name) => [name, new Map()]),
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
    doc(id) {
      return {
        async get() {
          return { data: store.has(id) ? cloneJson(store.get(id)) : null };
        },
      };
    },
    where(query) {
      const matched = () =>
        [...store.values()].filter((record) =>
          Object.entries(query).every(([key, value]) => record?.[key] === value),
        );
      return createQuery(matched);
    },
  };
}

function createQuery(matched, state = {}) {
  const nextState = {
    orderByFields: state.orderByFields || [],
    skipValue: state.skipValue || 0,
    limitValue: state.limitValue ?? null,
  };

  return {
    orderBy(field, direction) {
      return createQuery(matched, {
        ...nextState,
        orderByFields: [...nextState.orderByFields, { field, direction }],
      });
    },
    skip(value) {
      return createQuery(matched, {
        ...nextState,
        skipValue: value,
      });
    },
    limit(value) {
      return createQuery(matched, {
        ...nextState,
        limitValue: value,
      });
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

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
