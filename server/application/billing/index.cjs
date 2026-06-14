const ORDER_STATUSES = Object.freeze([
  "created",
  "pending",
  "paid",
  "fulfilled",
  "closed",
  "refund_pending",
  "refunded",
]);

const ORDER_TRANSITIONS = Object.freeze({
  created: ["pending", "closed"],
  pending: ["paid", "closed"],
  paid: ["fulfilled", "closed", "refund_pending"],
  fulfilled: ["refund_pending"],
  closed: [],
  refund_pending: ["paid", "fulfilled", "refunded"],
  refunded: [],
});

const CREDIT_LEDGER_OPERATIONS = Object.freeze([
  "purchase",
  "grant",
  "reserve",
  "commit",
  "release",
  "refund",
  "adjustment",
  "expire",
]);

const CREDIT_REFERENCE_TYPES = Object.freeze([
  "order",
  "payment",
  "refund",
  "ai_run",
  "admin",
]);

const CREDIT_RESERVATION_STATUSES = Object.freeze([
  "reserved",
  "committed",
  "released",
]);

class BillingError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "BillingError";
    this.code = code;
    this.status = status;
  }
}

class InMemoryBillingRepository {
  constructor(seed = {}) {
    this.creditPackages = new Map(
      Object.entries(seed.creditPackages || {}).map(([id, value]) => [
        id,
        cloneJson(value),
      ]),
    );
    this.orders = new Map(
      Object.entries(seed.orders || {}).map(([id, value]) => [id, cloneJson(value)]),
    );
    this.orderCreateKeys = new Map();
    this.orderActions = new Map();
    this.orderActionKeys = new Map();
    this.ledgerEntries = new Map(
      Object.entries(seed.ledgerEntries || {}).map(([id, value]) => [
        id,
        cloneJson(value),
      ]),
    );
    this.ledgerKeys = new Map();
    this.reservations = new Map(
      Object.entries(seed.reservations || {}).map(([id, value]) => [
        id,
        cloneJson(value),
      ]),
    );
    this.reservationKeys = new Map();

    for (const order of this.orders.values()) {
      if (order.idempotencyKey) this.orderCreateKeys.set(order.idempotencyKey, order.id);
    }
    for (const action of this.orderActions.values()) {
      if (action.idempotencyKey) this.orderActionKeys.set(action.idempotencyKey, action.id);
    }
    for (const entry of this.ledgerEntries.values()) {
      if (entry.idempotencyKey) this.ledgerKeys.set(entry.idempotencyKey, entry.id);
    }
    for (const reservation of this.reservations.values()) {
      if (reservation.idempotencyKey) {
        this.reservationKeys.set(reservation.idempotencyKey, reservation.id);
      }
    }
  }

  async getCreditPackage(packageId) {
    return cloneJson(this.creditPackages.get(packageId) || null);
  }

  async insertCreditPackage(record) {
    if (this.creditPackages.has(record.packageId)) {
      throw new BillingError(
        "CREDIT_PACKAGE_ALREADY_EXISTS",
        `Credit package "${record.packageId}" already exists.`,
        409,
      );
    }
    this.creditPackages.set(record.packageId, cloneJson(record));
    return cloneJson(record);
  }

  async listCreditPackages() {
    return [...this.creditPackages.values()].map((value) => cloneJson(value));
  }

  async getOrder(orderId) {
    return cloneJson(this.orders.get(orderId) || null);
  }

  async findOrderByIdempotencyKey(idempotencyKey) {
    const orderId = this.orderCreateKeys.get(idempotencyKey);
    return orderId ? cloneJson(this.orders.get(orderId) || null) : null;
  }

  async insertOrder(record) {
    if (this.orders.has(record.id)) {
      throw new BillingError("ORDER_ALREADY_EXISTS", `Order "${record.id}" already exists.`, 409);
    }
    if (record.idempotencyKey && this.orderCreateKeys.has(record.idempotencyKey)) {
      return null;
    }
    this.orders.set(record.id, cloneJson(record));
    if (record.idempotencyKey) this.orderCreateKeys.set(record.idempotencyKey, record.id);
    return cloneJson(record);
  }

  async updateOrderIfVersion(orderId, expectedVersion, nextRecord) {
    const current = this.orders.get(orderId);
    if (!current || current.version !== expectedVersion) return false;
    this.orders.set(orderId, cloneJson(nextRecord));
    return true;
  }

  async findOrderActionByIdempotencyKey(idempotencyKey) {
    const actionId = this.orderActionKeys.get(idempotencyKey);
    return actionId ? cloneJson(this.orderActions.get(actionId) || null) : null;
  }

  async insertOrderAction(record) {
    if (this.orderActions.has(record.id)) {
      throw new BillingError(
        "ORDER_ACTION_ALREADY_EXISTS",
        `Order action "${record.id}" already exists.`,
        409,
      );
    }
    if (record.idempotencyKey && this.orderActionKeys.has(record.idempotencyKey)) {
      return null;
    }
    this.orderActions.set(record.id, cloneJson(record));
    if (record.idempotencyKey) this.orderActionKeys.set(record.idempotencyKey, record.id);
    return cloneJson(record);
  }

  async getReservation(reservationId) {
    return cloneJson(this.reservations.get(reservationId) || null);
  }

  async findReservationByIdempotencyKey(idempotencyKey) {
    const reservationId = this.reservationKeys.get(idempotencyKey);
    return reservationId ? cloneJson(this.reservations.get(reservationId) || null) : null;
  }

  async insertReservation(record) {
    if (this.reservations.has(record.id)) {
      throw new BillingError(
        "RESERVATION_ALREADY_EXISTS",
        `Reservation "${record.id}" already exists.`,
        409,
      );
    }
    if (record.idempotencyKey && this.reservationKeys.has(record.idempotencyKey)) {
      return null;
    }
    this.reservations.set(record.id, cloneJson(record));
    if (record.idempotencyKey) this.reservationKeys.set(record.idempotencyKey, record.id);
    return cloneJson(record);
  }

  async updateReservationIfVersion(reservationId, expectedVersion, nextRecord) {
    const current = this.reservations.get(reservationId);
    if (!current || current.version !== expectedVersion) return false;
    this.reservations.set(reservationId, cloneJson(nextRecord));
    return true;
  }

  async findLedgerEntryByIdempotencyKey(idempotencyKey) {
    const entryId = this.ledgerKeys.get(idempotencyKey);
    return entryId ? cloneJson(this.ledgerEntries.get(entryId) || null) : null;
  }

  async insertLedgerEntry(record) {
    if (this.ledgerEntries.has(record.id)) {
      throw new BillingError(
        "LEDGER_ENTRY_ALREADY_EXISTS",
        `Ledger entry "${record.id}" already exists.`,
        409,
      );
    }
    if (record.idempotencyKey && this.ledgerKeys.has(record.idempotencyKey)) {
      return null;
    }
    this.ledgerEntries.set(record.id, cloneJson(record));
    if (record.idempotencyKey) this.ledgerKeys.set(record.idempotencyKey, record.id);
    return cloneJson(record);
  }

  async listLedgerEntriesByAccount(accountId) {
    return [...this.ledgerEntries.values()]
      .filter((entry) => entry.accountId === accountId)
      .map((entry) => cloneJson(entry));
  }

  async runInTransaction(work) {
    const snapshot = snapshotInMemoryRepository(this);
    try {
      return await work(this);
    } catch (error) {
      restoreInMemoryRepository(this, snapshot);
      throw error;
    }
  }
}

function createBillingService({
  repository,
  now = () => new Date().toISOString(),
  createId = defaultCreateId,
} = {}) {
  if (!repository) {
    throw new BillingError(
      "REPOSITORY_REQUIRED",
      "Billing service requires a repository.",
    );
  }

  async function createOrder(input) {
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    const packageId = requireString(input?.packageId, "packageId");
    const creditPackage = await repository.getCreditPackage(packageId);
    if (!creditPackage) {
      throw new BillingError(
        "CREDIT_PACKAGE_NOT_FOUND",
        `Credit package "${packageId}" was not found.`,
        404,
      );
    }
    if (!creditPackage.enabled) {
      throw new BillingError(
        "CREDIT_PACKAGE_DISABLED",
        `Credit package "${packageId}" is disabled.`,
        409,
      );
    }
    const provider = requireString(input?.provider, "provider");
    const channelScope = Array.isArray(creditPackage.channelScope)
      ? creditPackage.channelScope
      : [];
    if (
      channelScope.length > 0 &&
      !channelScope.includes(provider)
    ) {
      throw new BillingError(
        "CREDIT_PACKAGE_CHANNEL_NOT_ALLOWED",
        `Credit package "${packageId}" is not available through provider "${provider}".`,
        409,
      );
    }
    const orderIdentity = pickOrderIdentity(input, creditPackage);
    const duplicate = await repository.findOrderByIdempotencyKey(idempotencyKey);
    if (duplicate) {
      assertDuplicate(
        duplicate,
        orderIdentity,
        pickRecordFields(duplicate, [
          "accountId",
          "packageId",
          "provider",
          "referenceId",
          "credits",
          "currency",
          "amountValue",
        ]),
        "ORDER_IDEMPOTENCY_KEY_REUSED",
      );
      return { order: duplicate, duplicate: true };
    }

    const createdAt = now();
    const order = {
      id: input?.orderId ? requireString(input.orderId, "orderId") : createId("order"),
      ...orderIdentity,
      status: "created",
      idempotencyKey,
      providerOrderId: input?.providerOrderId || null,
      metadata: cloneJson(input?.metadata || null),
      createdAt,
      updatedAt: createdAt,
      paidAt: null,
      fulfilledAt: null,
      closedAt: null,
      refundedAt: null,
      version: 0,
    };
    await repository.insertOrder(order);
    return { order, duplicate: false };
  }

  async function createCreditPackage(input) {
    const timestamp = now();
    const creditPackage = buildCreditPackage({
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await repository.insertCreditPackage(creditPackage);
    return creditPackage;
  }

  async function getCreditPackage({ packageId }) {
    const creditPackage = await repository.getCreditPackage(
      requireString(packageId, "packageId"),
    );
    if (!creditPackage) {
      throw new BillingError(
        "CREDIT_PACKAGE_NOT_FOUND",
        `Credit package "${packageId}" was not found.`,
        404,
      );
    }
    return creditPackage;
  }

  async function listCreditPackages({ enabledOnly = false } = {}) {
    const packages = await repository.listCreditPackages();
    return enabledOnly ? packages.filter((item) => item.enabled) : packages;
  }

  async function markOrderPending(input) {
    return transitionOrderStatus({ ...input, nextStatus: "pending" });
  }

  async function markOrderPaid(input) {
    return transitionOrderStatus({ ...input, nextStatus: "paid" });
  }

  async function fulfillOrder(input) {
    return transitionOrderStatus({ ...input, nextStatus: "fulfilled" });
  }

  async function closeOrder(input) {
    return transitionOrderStatus({ ...input, nextStatus: "closed" });
  }

  async function markRefundPending(input) {
    return transitionOrderStatus({ ...input, nextStatus: "refund_pending" });
  }

  async function markRefunded(input) {
    return transitionOrderStatus({ ...input, nextStatus: "refunded" });
  }

  async function transitionOrderStatus(input) {
    return runInTransaction((transactionRepository) =>
      transitionOrderStatusWithRepository(transactionRepository, input),
    );
  }

  async function transitionOrderStatusWithRepository(activeRepository, input) {
    const orderId = requireString(input?.orderId, "orderId");
    const referenceId = requireReferenceId(input?.referenceId);
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    const nextStatus = requireOrderStatus(input?.nextStatus, "nextStatus");
    const duplicateAction =
      await activeRepository.findOrderActionByIdempotencyKey(idempotencyKey);
    if (duplicateAction) {
      assertDuplicate(
        duplicateAction,
        { orderId, nextStatus, referenceId },
        pickRecordFields(duplicateAction, ["orderId", "nextStatus", "referenceId"]),
        "ORDER_IDEMPOTENCY_KEY_REUSED",
      );
      const duplicateOrder = await activeRepository.getOrder(orderId);
      return { order: duplicateOrder, duplicate: true };
    }

    const order = await activeRepository.getOrder(orderId);
    if (!order) {
      throw new BillingError("ORDER_NOT_FOUND", `Order "${orderId}" was not found.`, 404);
    }
    if (order.referenceId !== referenceId) {
      throw new BillingError(
        "ORDER_REFERENCE_MISMATCH",
        "referenceId must remain stable across order lifecycle transitions.",
        409,
      );
    }

    assertOrderTransition(order.status, nextStatus);
    const timestamp = now();
    const nextOrder = {
      ...order,
      status: nextStatus,
      providerOrderId: input?.providerOrderId || order.providerOrderId || null,
      updatedAt: timestamp,
      paidAt: nextStatus === "paid" ? timestamp : order.paidAt,
      fulfilledAt: nextStatus === "fulfilled" ? timestamp : order.fulfilledAt,
      closedAt: nextStatus === "closed" ? timestamp : order.closedAt,
      refundedAt: nextStatus === "refunded" ? timestamp : order.refundedAt,
      version: order.version + 1,
    };

    const updated = await activeRepository.updateOrderIfVersion(
      orderId,
      order.version,
      nextOrder,
    );
    if (!updated) {
      throw new BillingError(
        "ORDER_VERSION_CONFLICT",
        `Expected order version ${order.version}, but update lost the race.`,
        409,
      );
    }

    await activeRepository.insertOrderAction({
      id: createId("order_action"),
      orderId,
      referenceId,
      previousStatus: order.status,
      nextStatus,
      providerOrderId: nextOrder.providerOrderId,
      idempotencyKey,
      createdAt: timestamp,
    });

    return { order: nextOrder, duplicate: false };
  }

  async function purchaseCredits(input) {
    return recordDirectCreditEntry({
      ...input,
      operation: "purchase",
    });
  }

  async function grantCredits(input) {
    return recordDirectCreditEntry({
      ...input,
      operation: input?.operation || "grant",
    });
  }

  async function reserveCredits(input) {
    const accountId = requireString(input?.accountId, "accountId");
    const referenceId = requireReferenceId(input?.referenceId);
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    const credits = requirePositiveInteger(input?.credits, "credits");
    const toolKey = requireString(input?.toolKey, "toolKey");
    const actionKey = requireString(input?.actionKey, "actionKey");
    const tierKey = requireString(input?.tierKey, "tierKey");
    return runInTransaction(async (activeRepository) => {
    const duplicate =
      await activeRepository.findReservationByIdempotencyKey(idempotencyKey);
    if (duplicate) {
      assertDuplicate(
        duplicate,
        { accountId, referenceId, credits, toolKey, actionKey, tierKey },
        pickRecordFields(duplicate, [
          "accountId",
          "referenceId",
          "credits",
          "toolKey",
          "actionKey",
          "tierKey",
        ]),
        "CREDIT_RESERVATION_IDEMPOTENCY_KEY_REUSED",
      );
      return {
        reservation: duplicate,
        account: await getCreditAccountWithRepository(activeRepository, accountId),
        duplicate: true,
      };
    }

    const account = await getCreditAccountWithRepository(activeRepository, accountId);
    if (account.availableCredits < credits) {
      throw new BillingError(
        "INSUFFICIENT_AVAILABLE_CREDITS",
        `Account "${accountId}" has ${account.availableCredits} available credits, cannot reserve ${credits}.`,
        409,
      );
    }

    const timestamp = now();
    const reservation = {
      id: input?.reservationId
        ? requireString(input.reservationId, "reservationId")
        : createId("reservation"),
      accountId,
      orderId: input?.orderId || null,
      referenceId,
      toolKey,
      actionKey,
      tierKey,
      credits,
      status: "reserved",
      idempotencyKey,
      metadata: cloneJson(input?.metadata || null),
      expiresAt: typeof input?.expiresAt === "string" ? input.expiresAt : null,
      createdAt: timestamp,
      updatedAt: timestamp,
      committedAt: null,
      releasedAt: null,
      version: 0,
    };
    await activeRepository.insertReservation(reservation);
    await activeRepository.insertLedgerEntry(
      buildLedgerEntry({
        id: createId("ledger"),
        accountId,
        orderId: reservation.orderId,
        reservationId: reservation.id,
        referenceType: "ai_run",
        referenceId,
        idempotencyKey,
        operation: "reserve",
        credits,
        availableDelta: -credits,
        reservedDelta: credits,
        consumedDelta: 0,
        createdAt: timestamp,
        metadata: input?.metadata || null,
      }),
    );

    return {
      reservation,
      account: await getCreditAccountWithRepository(activeRepository, accountId),
      duplicate: false,
    };
    });
  }

  async function commitCredits(input) {
    return finalizeReservation({ ...input, nextStatus: "committed", operation: "commit" });
  }

  async function releaseCredits(input) {
    return finalizeReservation({ ...input, nextStatus: "released", operation: "release" });
  }

  async function finalizeReservation(input) {
    const reservationId = requireString(input?.reservationId, "reservationId");
    const referenceId = requireReferenceId(input?.referenceId);
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    const operation = requireLedgerOperation(input?.operation);
    const nextStatus = requireReservationStatus(input?.nextStatus, "nextStatus");
    return runInTransaction(async (activeRepository) => {
    const existingEntry =
      await activeRepository.findLedgerEntryByIdempotencyKey(idempotencyKey);
    if (existingEntry) {
      assertDuplicate(
        existingEntry,
        { reservationId, referenceId, operation },
        pickRecordFields(existingEntry, ["reservationId", "referenceId", "operation"]),
        "LEDGER_IDEMPOTENCY_KEY_REUSED",
      );
      const duplicateReservation = await activeRepository.getReservation(reservationId);
      return {
        reservation: duplicateReservation,
        account: await getCreditAccountWithRepository(
          activeRepository,
          duplicateReservation.accountId,
        ),
        duplicate: true,
      };
    }

    const reservation = await activeRepository.getReservation(reservationId);
    if (!reservation) {
      throw new BillingError(
        "RESERVATION_NOT_FOUND",
        `Reservation "${reservationId}" was not found.`,
        404,
      );
    }
    if (reservation.referenceId !== referenceId) {
      throw new BillingError(
        "RESERVATION_REFERENCE_MISMATCH",
        "referenceId must remain stable across reserve/commit/release.",
        409,
      );
    }
    if (reservation.status !== "reserved") {
      throw new BillingError(
        "RESERVATION_NOT_ACTIVE",
        `Reservation "${reservationId}" is already ${reservation.status}.`,
        409,
      );
    }

    const timestamp = now();
    const nextReservation = {
      ...reservation,
      status: nextStatus,
      updatedAt: timestamp,
      committedAt: nextStatus === "committed" ? timestamp : reservation.committedAt,
      releasedAt: nextStatus === "released" ? timestamp : reservation.releasedAt,
      version: reservation.version + 1,
    };
    const updated = await activeRepository.updateReservationIfVersion(
      reservationId,
      reservation.version,
      nextReservation,
    );
    if (!updated) {
      throw new BillingError(
        "RESERVATION_VERSION_CONFLICT",
        `Expected reservation version ${reservation.version}, but update lost the race.`,
        409,
      );
    }

    const deltas =
      nextStatus === "committed"
        ? {
            availableDelta: 0,
            reservedDelta: -reservation.credits,
            consumedDelta: reservation.credits,
          }
        : {
            availableDelta: reservation.credits,
            reservedDelta: -reservation.credits,
            consumedDelta: 0,
          };

    await activeRepository.insertLedgerEntry(
      buildLedgerEntry({
        id: createId("ledger"),
        accountId: reservation.accountId,
        orderId: reservation.orderId,
        reservationId,
        referenceType: "ai_run",
        referenceId,
        idempotencyKey,
        operation,
        credits: reservation.credits,
        createdAt: timestamp,
        metadata: input?.metadata || null,
        ...deltas,
      }),
    );

    return {
      reservation: nextReservation,
      account: await getCreditAccountWithRepository(
        activeRepository,
        reservation.accountId,
      ),
      duplicate: false,
    };
    });
  }

  async function settlePaidOrder(input) {
    const orderId = requireString(input?.orderId, "orderId");
    const referenceId = requireReferenceId(input?.referenceId);
    const requestId = requireString(input?.requestId, "requestId");
    const providerOrderId = input?.providerOrderId || null;

    return runInTransaction(async (activeRepository) => {
      let order = await activeRepository.getOrder(orderId);
      if (!order) {
        throw new BillingError("ORDER_NOT_FOUND", `Order "${orderId}" was not found.`, 404);
      }
      if (order.referenceId !== referenceId) {
        throw new BillingError(
          "ORDER_REFERENCE_MISMATCH",
          "referenceId must remain stable across order lifecycle transitions.",
          409,
        );
      }
      if (["closed", "refund_pending", "refunded"].includes(order.status)) {
        throw new BillingError(
          "PAYMENT_EVENT_CONFLICT",
          `Order "${order.id}" is ${order.status} and cannot settle payment success.`,
          409,
        );
      }

      if (order.status === "created") {
        order = (
          await transitionOrderStatusWithRepository(activeRepository, {
            orderId,
            referenceId,
            providerOrderId,
            nextStatus: "pending",
            idempotencyKey: `order.pending:${referenceId}:payment:${providerOrderId || requestId}`,
          })
        ).order;
      }
      if (order.status === "pending") {
        order = (
          await transitionOrderStatusWithRepository(activeRepository, {
            orderId,
            referenceId,
            providerOrderId,
            nextStatus: "paid",
            idempotencyKey: `order.paid:${referenceId}:${requestId}`,
          })
        ).order;
      }

      const purchase = await recordDirectCreditEntryWithRepository(activeRepository, {
        accountId: order.accountId,
        orderId: order.id,
        referenceType: "order",
        referenceId,
        operation: "purchase",
        credits: order.credits,
        idempotencyKey: `ledger.purchase:${referenceId}:${requestId}`,
        metadata: input?.metadata || null,
      });

      if (order.status === "paid") {
        order = (
          await transitionOrderStatusWithRepository(activeRepository, {
            orderId,
            referenceId,
            providerOrderId,
            nextStatus: "fulfilled",
            idempotencyKey: `order.fulfilled:${referenceId}:${requestId}`,
          })
        ).order;
      }

      return { order, entry: purchase.entry, account: purchase.account };
    });
  }

  async function recordDirectCreditEntry(input) {
    return recordDirectCreditEntryWithRepository(repository, input);
  }

  async function recordDirectCreditEntryWithRepository(activeRepository, input) {
    const operation = requireLedgerOperation(input?.operation);
    if (!["purchase", "grant", "refund", "adjustment", "expire"].includes(operation)) {
      throw new BillingError(
        "UNSUPPORTED_CREDIT_OPERATION",
        `Operation "${operation}" must not be used for direct credit writes.`,
      );
    }
    const accountId = requireString(input?.accountId, "accountId");
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    const duplicate =
      await activeRepository.findLedgerEntryByIdempotencyKey(idempotencyKey);
    const direction = operation === "expire" ? -1 : 1;
    const credits = requirePositiveInteger(input?.credits, "credits");
    const expected = {
      accountId,
      referenceId: requireReferenceId(input?.referenceId),
      operation,
      credits,
    };

    if (duplicate) {
      assertDuplicate(
        duplicate,
        expected,
        pickRecordFields(duplicate, ["accountId", "referenceId", "operation", "credits"]),
        "LEDGER_IDEMPOTENCY_KEY_REUSED",
      );
      return {
        entry: duplicate,
        account: await getCreditAccountWithRepository(activeRepository, accountId),
        duplicate: true,
      };
    }

    const entry = buildLedgerEntry({
      id: createId("ledger"),
      accountId,
      orderId: input?.orderId || null,
      reservationId: input?.reservationId || null,
      referenceType: requireReferenceType(input?.referenceType),
      referenceId: expected.referenceId,
      idempotencyKey,
      operation,
      credits,
      availableDelta: direction * credits,
      reservedDelta: 0,
      consumedDelta: 0,
      metadata: input?.metadata || null,
      createdAt: now(),
    });
    await activeRepository.insertLedgerEntry(entry);
    return {
      entry,
      account: await getCreditAccountWithRepository(activeRepository, accountId),
      duplicate: false,
    };
  }

  async function getCreditAccount({ accountId }) {
    const normalizedAccountId = requireString(accountId, "accountId");
    return getCreditAccountWithRepository(repository, normalizedAccountId);
  }

  async function getCreditAccountWithRepository(activeRepository, accountId) {
    const entries = await activeRepository.listLedgerEntriesByAccount(accountId);
    return calculateCreditAccount(accountId, entries);
  }

  async function runInTransaction(work) {
    if (typeof repository.runInTransaction === "function") {
      return repository.runInTransaction(work);
    }
    return work(repository);
  }

  return {
    closeOrder,
    commitCredits,
    createCreditPackage,
    createOrder,
    fulfillOrder,
    getCreditAccount,
    getCreditPackage,
    grantCredits,
    listCreditPackages,
    markOrderPaid,
    markOrderPending,
    markRefundPending,
    markRefunded,
    purchaseCredits,
    releaseCredits,
    reserveCredits,
    settlePaidOrder,
    transitionOrderStatus,
  };
}

function snapshotInMemoryRepository(repository) {
  return {
    creditPackages: new Map(repository.creditPackages),
    orders: new Map(repository.orders),
    orderCreateKeys: new Map(repository.orderCreateKeys),
    orderActions: new Map(repository.orderActions),
    orderActionKeys: new Map(repository.orderActionKeys),
    ledgerEntries: new Map(repository.ledgerEntries),
    ledgerKeys: new Map(repository.ledgerKeys),
    reservations: new Map(repository.reservations),
    reservationKeys: new Map(repository.reservationKeys),
  };
}

function restoreInMemoryRepository(repository, snapshot) {
  Object.assign(repository, snapshot);
}

function calculateCreditAccount(accountId, entries) {
  const totals = entries.reduce(
    (account, entry) => ({
      availableCredits: account.availableCredits + entry.availableDelta,
      reservedCredits: account.reservedCredits + entry.reservedDelta,
      consumedCredits: account.consumedCredits + entry.consumedDelta,
      totalIssuedCredits:
        account.totalIssuedCredits +
        (entry.operation === "purchase" || entry.operation === "grant" || entry.operation === "refund"
          ? entry.credits
          : 0),
      totalExpiredCredits:
        account.totalExpiredCredits + (entry.operation === "expire" ? entry.credits : 0),
    }),
    {
      availableCredits: 0,
      reservedCredits: 0,
      consumedCredits: 0,
      totalIssuedCredits: 0,
      totalExpiredCredits: 0,
    },
  );
  return {
    id: accountId,
    accountId,
    ...totals,
  };
}

function buildLedgerEntry(input) {
  return {
    id: requireString(input?.id, "id"),
    accountId: requireString(input?.accountId, "accountId"),
    orderId: input?.orderId || null,
    reservationId: input?.reservationId || null,
    referenceType: requireReferenceType(input?.referenceType),
    referenceId: requireReferenceId(input?.referenceId),
    idempotencyKey: requireIdempotencyKey(input?.idempotencyKey),
    operation: requireLedgerOperation(input?.operation),
    credits: requirePositiveInteger(input?.credits, "credits"),
    availableDelta: requireInteger(input?.availableDelta, "availableDelta"),
    reservedDelta: requireInteger(input?.reservedDelta, "reservedDelta"),
    consumedDelta: requireInteger(input?.consumedDelta, "consumedDelta"),
    metadata: cloneJson(input?.metadata || null),
    createdAt: requireString(input?.createdAt, "createdAt"),
  };
}

function buildCreditPackage(input) {
  const credits = requirePositiveInteger(input?.credits, "credits");
  const bonusCredits =
    input?.bonusCredits === undefined
      ? 0
      : requireNonNegativeInteger(input.bonusCredits, "bonusCredits");
  return {
    packageId: requireString(input?.packageId, "packageId"),
    displayName: requireString(input?.displayName, "displayName"),
    credits,
    bonusCredits,
    totalCredits: credits + bonusCredits,
    priceValue: requireNonNegativeInteger(input?.priceValue, "priceValue"),
    currency: requireCurrency(input?.currency),
    enabled: requireBoolean(input?.enabled, "enabled"),
    validityDays:
      input?.validityDays === null || input?.validityDays === undefined
        ? null
        : requirePositiveInteger(input.validityDays, "validityDays"),
    channelScope: Array.isArray(input?.channelScope)
      ? input.channelScope.map((value) => requireString(value, "channelScope item"))
      : [],
    description: optionalString(input?.description),
    sortOrder:
      input?.sortOrder === undefined
        ? 0
        : requireNonNegativeInteger(input.sortOrder, "sortOrder"),
    metadata: cloneJson(input?.metadata || null),
    createdAt: requireString(input?.createdAt, "createdAt"),
    updatedAt: requireString(input?.updatedAt, "updatedAt"),
    version: 0,
  };
}

function canTransitionOrderStatus(currentStatus, nextStatus) {
  if (!ORDER_STATUSES.includes(currentStatus)) return false;
  if (!ORDER_STATUSES.includes(nextStatus)) return false;
  return ORDER_TRANSITIONS[currentStatus].includes(nextStatus);
}

function assertOrderTransition(currentStatus, nextStatus) {
  if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
    throw new BillingError(
      "INVALID_ORDER_TRANSITION",
      `Order transition "${currentStatus}" -> "${nextStatus}" is not allowed.`,
      409,
    );
  }
}

function buildReferenceId({ scope, id }) {
  return `${requireString(scope, "scope")}:${requireString(id, "id")}`;
}

function buildIdempotencyKey({ scope, referenceId, requestId }) {
  return `${requireString(scope, "scope")}:${requireReferenceId(referenceId)}:${requireString(
    requestId,
    "requestId",
  )}`;
}

function pickOrderIdentity(input, creditPackage) {
  return {
    accountId: requireString(input?.accountId, "accountId"),
    packageId: creditPackage.packageId,
    provider: requireString(input?.provider, "provider"),
    referenceId: requireReferenceId(input?.referenceId),
    credits: creditPackage.totalCredits,
    currency: creditPackage.currency,
    amountValue: creditPackage.priceValue,
  };
}

function pickRecordFields(record, fields) {
  return fields.reduce((result, field) => {
    result[field] = record[field];
    return result;
  }, {});
}

function assertDuplicate(record, expected, actual, code) {
  const normalizedExpected = JSON.stringify(expected);
  const normalizedActual = JSON.stringify(actual);
  if (normalizedExpected !== normalizedActual) {
    throw new BillingError(
      code,
      "idempotencyKey was already used with a different semantic payload.",
      409,
    );
  }
  return record;
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function defaultCreateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function requireCurrency(value) {
  const currency = requireString(value, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BillingError("INVALID_INPUT", "currency must be an ISO-4217 style code.");
  }
  return currency;
}

function requireIdempotencyKey(value) {
  const key = requireString(value, "idempotencyKey");
  if (key.length > 160) {
    throw new BillingError("INVALID_INPUT", "idempotencyKey must be 160 chars or shorter.");
  }
  const segments = key.split(":");
  if (
    segments.length < 4 ||
    segments.some((segment) => !segment) ||
    !/^[a-z][a-z0-9_.-]*$/.test(segments[0])
  ) {
    throw new BillingError(
      "INVALID_INPUT",
      "idempotencyKey must follow <action-scope>:<reference-scope>:<reference-id>:<request-id>.",
    );
  }
  return key;
}

function requireReferenceId(value) {
  const referenceId = requireString(value, "referenceId");
  if (!/^[a-z][a-z0-9_.-]*:[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(referenceId)) {
    throw new BillingError(
      "INVALID_INPUT",
      "referenceId must be namespaced as <scope>:<stable-id>, for example ai_run:run_123.",
    );
  }
  return referenceId;
}

function requireOrderStatus(value, field) {
  const status = requireString(value, field);
  if (!ORDER_STATUSES.includes(status)) {
    throw new BillingError("INVALID_INPUT", `${field} must be a supported order status.`);
  }
  return status;
}

function requireLedgerOperation(value) {
  const operation = requireString(value, "operation");
  if (!CREDIT_LEDGER_OPERATIONS.includes(operation)) {
    throw new BillingError("INVALID_INPUT", `Unsupported ledger operation "${operation}".`);
  }
  return operation;
}

function requireReferenceType(value) {
  const referenceType = requireString(value, "referenceType");
  if (!CREDIT_REFERENCE_TYPES.includes(referenceType)) {
    throw new BillingError("INVALID_INPUT", `Unsupported referenceType "${referenceType}".`);
  }
  return referenceType;
}

function requireReservationStatus(value, field) {
  const status = requireString(value, field);
  if (!CREDIT_RESERVATION_STATUSES.includes(status)) {
    throw new BillingError("INVALID_INPUT", `${field} must be a reservation status.`);
  }
  return status;
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new BillingError("INVALID_INPUT", `${field} must be a positive integer.`);
  }
  return value;
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new BillingError("INVALID_INPUT", `${field} must be a non-negative integer.`);
  }
  return value;
}

function requireInteger(value, field) {
  if (!Number.isInteger(value)) {
    throw new BillingError("INVALID_INPUT", `${field} must be an integer.`);
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new BillingError("INVALID_INPUT", `${field} must be a boolean.`);
  }
  return value;
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return requireString(value, "value");
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BillingError("INVALID_INPUT", `${field} is required.`);
  }
  return value.trim();
}

module.exports = {
  BillingError,
  CREDIT_LEDGER_OPERATIONS,
  CREDIT_REFERENCE_TYPES,
  CREDIT_RESERVATION_STATUSES,
  InMemoryBillingRepository,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  assertOrderTransition,
  buildIdempotencyKey,
  buildReferenceId,
  buildCreditPackage,
  calculateCreditAccount,
  canTransitionOrderStatus,
  createBillingService,
};
