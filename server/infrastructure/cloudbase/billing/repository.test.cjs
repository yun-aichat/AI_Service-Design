const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BILLING_COLLECTIONS,
  CloudBaseBillingRepository,
  LEDGER_PAGE_SIZE,
} = require("./repository.cjs");
const {
  buildIdempotencyKey,
  buildOrderPurchaseIdempotencyKey,
  buildReferenceId,
  calculateCreditAccount,
  createBillingService,
} = require("../../../application/billing/index.cjs");

test("credit package methods persist and list package records", async () => {
  const { repository } = createRepository();
  const record = {
    packageId: "starter-100",
    id: "starter-100",
    credits: 100,
    enabled: true,
  };

  await repository.insertCreditPackage(record);

  assert.deepEqual(await repository.getCreditPackage(record.packageId), record);
  assert.deepEqual(await repository.listCreditPackages(), [record]);
  await assert.rejects(
    () => repository.insertCreditPackage({ ...record, credits: 200 }),
    (error) => error.code === "CREDIT_PACKAGE_ALREADY_EXISTS",
  );
});

test("order methods enforce idempotency and optimistic version updates", async () => {
  const { repository } = createRepository();
  const order = {
    id: "order-1",
    idempotencyKey: "order.create:order:order-1:req-1",
    status: "created",
    version: 0,
  };

  assert.deepEqual(await repository.insertOrder(order), order);
  assert.equal(await repository.insertOrder({ ...order, id: "order-2" }), null);
  assert.deepEqual(
    await repository.findOrderByIdempotencyKey(order.idempotencyKey),
    order,
  );

  const nextOrder = { ...order, status: "pending", version: 1 };
  assert.equal(await repository.updateOrderIfVersion(order.id, 0, nextOrder), true);
  assert.equal(await repository.updateOrderIfVersion(order.id, 0, order), false);
  assert.deepEqual(await repository.getOrder(order.id), nextOrder);
});

test("order action methods use stable ids and idempotency keys", async () => {
  const { repository } = createRepository();
  const action = {
    id: "action-1",
    orderId: "order-1",
    idempotencyKey: "order.pending:order:order-1:req-1",
  };

  assert.deepEqual(await repository.insertOrderAction(action), action);
  assert.equal(
    await repository.insertOrderAction({ ...action, id: "action-2" }),
    null,
  );
  assert.deepEqual(
    await repository.findOrderActionByIdempotencyKey(action.idempotencyKey),
    action,
  );
});

test("reservation methods enforce idempotency and optimistic version updates", async () => {
  const { repository } = createRepository();
  const reservation = {
    id: "reservation-1",
    accountId: "acct-1",
    idempotencyKey: "credit.reserve:ai_run:run-1:req-1",
    status: "reserved",
    version: 0,
  };

  assert.deepEqual(await repository.insertReservation(reservation), reservation);
  assert.equal(
    await repository.insertReservation({ ...reservation, id: "reservation-2" }),
    null,
  );
  assert.deepEqual(
    await repository.findReservationByIdempotencyKey(
      reservation.idempotencyKey,
    ),
    reservation,
  );

  const committed = { ...reservation, status: "committed", version: 1 };
  assert.equal(
    await repository.updateReservationIfVersion(reservation.id, 0, committed),
    true,
  );
  assert.equal(
    await repository.updateReservationIfVersion(reservation.id, 0, reservation),
    false,
  );
  assert.deepEqual(await repository.getReservation(reservation.id), committed);
});

test("ledger methods enforce idempotency and list entries by account", async () => {
  const { repository } = createRepository();
  const purchaseReference = buildReferenceId({ scope: "order", id: "order-1" });
  const first = {
    id: "ledger-1",
    accountId: "acct-1",
    orderId: "order-1",
    referenceId: purchaseReference,
    idempotencyKey: buildOrderPurchaseIdempotencyKey(purchaseReference),
    operation: "purchase",
  };
  const second = {
    id: "ledger-2",
    accountId: "acct-2",
    idempotencyKey: "credit.grant:admin:ticket-1:req-1",
    operation: "grant",
  };

  assert.deepEqual(await repository.insertLedgerEntry(first), first);
  assert.equal(
    await repository.insertLedgerEntry({ ...first, id: "ledger-duplicate" }),
    null,
  );
  await repository.insertLedgerEntry(second);

  assert.deepEqual(
    await repository.findLedgerEntryByIdempotencyKey(first.idempotencyKey),
    first,
  );
  assert.deepEqual(await repository.listLedgerEntriesByAccount("acct-1"), [
    first,
  ]);
});

test("repository binds the documented CloudBase collections", () => {
  const database = createFakeDatabase();
  new CloudBaseBillingRepository(database);

  assert.deepEqual(database.requestedCollections, [
    BILLING_COLLECTIONS.creditPackages,
    BILLING_COLLECTIONS.orders,
    BILLING_COLLECTIONS.orderActions,
    BILLING_COLLECTIONS.reservations,
    BILLING_COLLECTIONS.ledgerEntries,
  ]);
});

test("billing service completes purchase reserve and commit through CloudBase repository", async () => {
  const { repository } = createRepository();
  const service = createBillingService({
    repository,
    now: () => "2026-06-14T00:00:00.000Z",
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}-${++sequence}`;
    })(),
  });
  await service.createCreditPackage({
    packageId: "starter-100",
    displayName: "Starter",
    credits: 100,
    bonusCredits: 0,
    priceValue: 990,
    currency: "CNY",
    enabled: true,
  });
  const purchaseReference = buildReferenceId({
    scope: "order",
    id: "order-1",
  });
  await service.purchaseCredits({
    accountId: "acct-1",
    orderId: "order-1",
    referenceType: "order",
    referenceId: purchaseReference,
    credits: 100,
    idempotencyKey: buildIdempotencyKey({
      scope: "credit.purchase",
      referenceId: purchaseReference,
      requestId: "req-1",
    }),
  });
  const runReference = buildReferenceId({ scope: "ai_run", id: "run-1" });
  const reserved = await service.reserveCredits({
    accountId: "acct-1",
    referenceId: runReference,
    toolKey: "journey-map",
    actionKey: "proposal",
    tierKey: "standard",
    credits: 15,
    idempotencyKey: buildIdempotencyKey({
      scope: "credit.reserve",
      referenceId: runReference,
      requestId: "req-2",
    }),
  });
  const committed = await service.commitCredits({
    reservationId: reserved.reservation.id,
    referenceId: runReference,
    idempotencyKey: buildIdempotencyKey({
      scope: "credit.commit",
      referenceId: runReference,
      requestId: "req-3",
    }),
  });

  assert.equal(committed.account.availableCredits, 85);
  assert.equal(committed.account.reservedCredits, 0);
  assert.equal(committed.account.consumedCredits, 15);
});

test("runInTransaction commits all collection writes together", async () => {
  const { repository } = createRepository();
  await repository.runInTransaction(async (transactionRepository) => {
    await transactionRepository.insertReservation({
      id: "reservation-tx",
      accountId: "acct-1",
      idempotencyKey: "reserve-tx",
      version: 0,
    });
    await transactionRepository.insertLedgerEntry({
      id: "ledger-tx",
      accountId: "acct-1",
      idempotencyKey: "ledger-tx",
      operation: "reserve",
    });
  });

  assert.ok(await repository.getReservation("reservation-tx"));
  assert.ok(await repository.findLedgerEntryByIdempotencyKey("ledger-tx"));
});

test("runInTransaction rolls all collection writes back on failure", async () => {
  const { repository } = createRepository();
  await assert.rejects(() =>
    repository.runInTransaction(async (transactionRepository) => {
      await transactionRepository.insertReservation({
        id: "reservation-rollback",
        accountId: "acct-1",
        idempotencyKey: "reserve-rollback",
        version: 0,
      });
      throw new Error("Injected transaction failure.");
    }),
  );

  assert.equal(await repository.getReservation("reservation-rollback"), null);
});

test("listLedgerEntriesByAccount reads more than 250 entries across pages", async () => {
  const totalEntries = 251;
  const entries = Array.from({ length: totalEntries }, (_, index) =>
    makeLedgerEntry({
      id: `ledger-${String(index).padStart(3, "0")}`,
      accountId: "acct-many",
      createdAt: `2026-06-${String((index % 28) + 1).padStart(2, "0")}T00:00:${String(
        index % 60,
      ).padStart(2, "0")}.000Z`,
    }),
  );
  const { repository, queryLog } = createRepository({
    ledgerEntries: entries,
  });

  const result = await repository.listLedgerEntriesByAccount("acct-many");

  assert.equal(result.length, totalEntries);
  assert.equal(
    queryLog.filter((entry) => entry.type === "get").length >= 3,
    true,
  );
});

test("listLedgerEntriesByAccount keeps boundary records stable without duplicates or omissions", async () => {
  const entries = Array.from({ length: LEDGER_PAGE_SIZE + 2 }, (_, index) =>
    makeLedgerEntry({
      id: `boundary-${String(index).padStart(3, "0")}`,
      accountId: "acct-boundary",
      createdAt:
        index < LEDGER_PAGE_SIZE
          ? "2026-06-14T00:00:00.000Z"
          : "2026-06-15T00:00:00.000Z",
    }),
  ).reverse();
  const { repository } = createRepository({
    ledgerEntries: entries,
  });

  const result = await repository.listLedgerEntriesByAccount("acct-boundary");

  assert.equal(result.length, LEDGER_PAGE_SIZE + 2);
  assert.deepEqual(
    result.map((entry) => entry.id),
    [...entries]
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.id.localeCompare(right.id)
          : left.createdAt.localeCompare(right.createdAt),
      )
      .map((entry) => entry.id),
  );
});

test("listLedgerEntriesByAccount does not mix ledger rows from other accounts", async () => {
  const { repository } = createRepository({
    ledgerEntries: [
      makeLedgerEntry({ id: "acct-a-1", accountId: "acct-a", createdAt: "2026-06-14T00:00:00.000Z" }),
      makeLedgerEntry({ id: "acct-b-1", accountId: "acct-b", createdAt: "2026-06-14T00:00:01.000Z" }),
      makeLedgerEntry({ id: "acct-a-2", accountId: "acct-a", createdAt: "2026-06-14T00:00:02.000Z" }),
    ],
  });

  const result = await repository.listLedgerEntriesByAccount("acct-a");

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["acct-a-1", "acct-a-2"],
  );
});

test("getCreditAccount uses the full CloudBase ledger and matches calculateCreditAccount", async () => {
  const ledgerEntries = [
    makeLedgerEntry({
      id: "purchase-1",
      accountId: "acct-calc",
      operation: "purchase",
      credits: 100,
      availableDelta: 100,
      createdAt: "2026-06-14T00:00:00.000Z",
    }),
    makeLedgerEntry({
      id: "reserve-1",
      accountId: "acct-calc",
      operation: "reserve",
      credits: 30,
      availableDelta: -30,
      reservedDelta: 30,
      createdAt: "2026-06-14T00:00:01.000Z",
    }),
    makeLedgerEntry({
      id: "commit-1",
      accountId: "acct-calc",
      operation: "commit",
      credits: 30,
      reservedDelta: -30,
      consumedDelta: 30,
      createdAt: "2026-06-14T00:00:02.000Z",
    }),
    makeLedgerEntry({
      id: "grant-1",
      accountId: "acct-calc",
      operation: "grant",
      credits: 20,
      availableDelta: 20,
      createdAt: "2026-06-14T00:00:03.000Z",
    }),
    makeLedgerEntry({
      id: "expire-1",
      accountId: "acct-calc",
      operation: "expire",
      credits: 10,
      availableDelta: -10,
      createdAt: "2026-06-14T00:00:04.000Z",
    }),
  ];
  const { repository } = createRepository({ ledgerEntries });
  const service = createBillingService({ repository });

  const account = await service.getCreditAccount({ accountId: "acct-calc" });

  assert.deepEqual(account, calculateCreditAccount("acct-calc", ledgerEntries));
});

test("listLedgerEntriesByAccount rethrows CloudBase query failures without partial results", async () => {
  const { repository } = createRepository({
    ledgerEntries: Array.from({ length: LEDGER_PAGE_SIZE + 1 }, (_, index) =>
      makeLedgerEntry({
        id: `ledger-fail-${index}`,
        accountId: "acct-fail",
        createdAt: `2026-06-14T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
      }),
    ),
    failOnSkipValue: LEDGER_PAGE_SIZE,
  });
  const service = createBillingService({ repository });

  await assert.rejects(
    () => repository.listLedgerEntriesByAccount("acct-fail"),
    /Injected CloudBase ledger query failure/,
  );
  await assert.rejects(
    () => service.getCreditAccount({ accountId: "acct-fail" }),
    /Injected CloudBase ledger query failure/,
  );
});

function createRepository(options = {}) {
  const database = createFakeDatabase(options);
  return {
    repository: new CloudBaseBillingRepository(database),
    stores: database.stores,
    queryLog: database.queryLog,
  };
}

function createFakeDatabase(options = {}) {
  const stores = Object.fromEntries(
    Object.values(BILLING_COLLECTIONS).map((name) => [name, new Map()]),
  );
  const requestedCollections = [];
  const queryLog = [];
  seedStore(stores[BILLING_COLLECTIONS.creditPackages], options.creditPackages, "packageId");
  seedStore(stores[BILLING_COLLECTIONS.orders], options.orders, "id");
  seedStore(stores[BILLING_COLLECTIONS.orderActions], options.orderActions, "id");
  seedStore(stores[BILLING_COLLECTIONS.reservations], options.reservations, "id");
  seedStore(stores[BILLING_COLLECTIONS.ledgerEntries], options.ledgerEntries, "id");

  const database = {
    stores,
    requestedCollections,
    queryLog,
    collection(name) {
      requestedCollections.push(name);
      const store = stores[name];
      if (!store) throw new Error(`Unknown collection "${name}".`);
      return createFakeCollection(store, queryLog, options);
    },
    async runTransaction(work) {
      const transactionStores = cloneStores(stores);
      const transactionDatabase = createFakeDatabaseFromStores(
        transactionStores,
        queryLog,
        options,
      );
      const result = await work(transactionDatabase);
      for (const [name, transactionStore] of Object.entries(transactionStores)) {
        stores[name].clear();
        for (const [id, record] of transactionStore) {
          stores[name].set(id, cloneJson(record));
        }
      }
      return result;
    },
  };
  return database;
}

function createFakeDatabaseFromStores(stores, queryLog, options = {}) {
  return {
    collection(name) {
      const store = stores[name];
      if (!store) throw new Error(`Unknown collection "${name}".`);
      return createFakeCollection(store, queryLog, options);
    },
  };
}

function cloneStores(stores) {
  return Object.fromEntries(
    Object.entries(stores).map(([name, store]) => [
      name,
      new Map([...store].map(([id, record]) => [id, cloneJson(record)])),
    ]),
  );
}

function createFakeCollection(store, queryLog, options = {}) {
  return {
    async add(record) {
      const id = record._id;
      if (store.has(id)) {
        const error = new Error(`duplicate key "${id}"`);
        error.code = "DUPLICATE_KEY";
        throw error;
      }
      store.set(id, cloneJson(record));
      return { id };
    },
    async get() {
      if (shouldFailGet(queryLog, options, 0)) {
        throw new Error("Injected CloudBase ledger query failure.");
      }
      return { data: [...store.values()].map(cloneJson) };
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
      const matched = () =>
        [...store.values()].filter((record) =>
          Object.entries(query).every(([key, value]) => record?.[key] === value),
        );
      return createFakeQuery(store, queryLog, matched, options);
    },
  };
}

function createFakeQuery(store, queryLog, matched, options = {}, state = {}) {
  const nextState = {
    orderByFields: state.orderByFields || [],
    skipValue: state.skipValue || 0,
    limitValue: state.limitValue ?? null,
  };

  return {
    orderBy(field, direction) {
      queryLog.push({ type: "orderBy", field, direction });
      return createFakeQuery(store, queryLog, matched, options, {
        ...nextState,
        orderByFields: [...nextState.orderByFields, { field, direction }],
      });
    },
    skip(value) {
      queryLog.push({ type: "skip", value });
      return createFakeQuery(store, queryLog, matched, options, {
        ...nextState,
        skipValue: value,
      });
    },
    limit(value) {
      queryLog.push({ type: "limit", value });
      return createFakeQuery(store, queryLog, matched, options, {
        ...nextState,
        limitValue: value,
      });
    },
    async get() {
      queryLog.push({ type: "get" });
      if (shouldFailGet(queryLog, options, nextState.skipValue)) {
        throw new Error("Injected CloudBase ledger query failure.");
      }
      const ordered = applyFakeOrdering(matched(), nextState.orderByFields);
      const sliced = ordered.slice(
        nextState.skipValue,
        nextState.limitValue === null
          ? undefined
          : nextState.skipValue + nextState.limitValue,
      );
      return { data: sliced.map(cloneJson) };
    },
    async update(nextRecord) {
      let updated = 0;
      for (const record of matched()) {
        store.set(record.id, cloneJson(nextRecord));
        updated += 1;
      }
      return { updated };
    },
  };
}

function applyFakeOrdering(records, orderByFields) {
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

function seedStore(store, records = [], idField) {
  for (const record of records || []) {
    store.set(record[idField], cloneJson(record));
  }
}

function shouldFailGet(queryLog, options, skipValue) {
  if (options.failOnSkipValue !== undefined && skipValue === options.failOnSkipValue) {
    return true;
  }
  const { failOnGetCall } = options;
  if (!failOnGetCall) return false;
  const getCallCount = queryLog.filter((entry) => entry.type === "get").length;
  return getCallCount === failOnGetCall;
}

function makeLedgerEntry(overrides = {}) {
  return {
    id: overrides.id || "ledger-default",
    accountId: overrides.accountId || "acct-default",
    orderId: overrides.orderId || null,
    reservationId: overrides.reservationId || null,
    referenceType: overrides.referenceType || "order",
    referenceId:
      overrides.referenceId || buildReferenceId({ scope: "order", id: overrides.id || "ledger-default" }),
    idempotencyKey:
      overrides.idempotencyKey ||
      buildIdempotencyKey({
        scope: `ledger.${overrides.operation || "purchase"}`,
        referenceId:
          overrides.referenceId ||
          buildReferenceId({ scope: "order", id: overrides.id || "ledger-default" }),
        requestId: overrides.id || "ledger-default",
      }),
    operation: overrides.operation || "purchase",
    credits: overrides.credits ?? 1,
    availableDelta: overrides.availableDelta ?? 1,
    reservedDelta: overrides.reservedDelta ?? 0,
    consumedDelta: overrides.consumedDelta ?? 0,
    metadata: overrides.metadata || null,
    createdAt: overrides.createdAt || "2026-06-14T00:00:00.000Z",
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
