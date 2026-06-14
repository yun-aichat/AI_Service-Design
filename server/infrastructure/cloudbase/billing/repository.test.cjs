const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BILLING_COLLECTIONS,
  CloudBaseBillingRepository,
} = require("./repository.cjs");
const {
  buildIdempotencyKey,
  buildOrderPurchaseIdempotencyKey,
  buildReferenceId,
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

function createRepository() {
  const database = createFakeDatabase();
  return {
    repository: new CloudBaseBillingRepository(database),
    stores: database.stores,
  };
}

function createFakeDatabase() {
  const stores = Object.fromEntries(
    Object.values(BILLING_COLLECTIONS).map((name) => [name, new Map()]),
  );
  const requestedCollections = [];

  const database = {
    stores,
    requestedCollections,
    collection(name) {
      requestedCollections.push(name);
      const store = stores[name];
      if (!store) throw new Error(`Unknown collection "${name}".`);
      return createFakeCollection(store);
    },
    async runTransaction(work) {
      const transactionStores = cloneStores(stores);
      const transactionDatabase = createFakeDatabaseFromStores(transactionStores);
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

function createFakeDatabaseFromStores(stores) {
  return {
    collection(name) {
      const store = stores[name];
      if (!store) throw new Error(`Unknown collection "${name}".`);
      return createFakeCollection(store);
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

function createFakeCollection(store) {
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
      const matched = () =>
        [...store.values()].filter((record) =>
          Object.entries(query).every(([key, value]) => record?.[key] === value),
        );
      return {
        limit(count) {
          return {
            async get() {
              return { data: matched().slice(0, count).map(cloneJson) };
            },
          };
        },
        async get() {
          return { data: matched().map(cloneJson) };
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
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
