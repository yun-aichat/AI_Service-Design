const { BillingError } = require("../../../application/billing/index.cjs");

const BILLING_COLLECTIONS = Object.freeze({
  creditPackages: "credit_packages",
  orders: "billing_orders",
  orderActions: "billing_order_actions",
  reservations: "credit_reservations",
  ledgerEntries: "credit_ledger",
});

class CloudBaseBillingRepository {
  constructor(database) {
    if (!database || typeof database.collection !== "function") {
      throw new Error("CloudBaseBillingRepository requires a database client.");
    }

    this.database = database;
    this.creditPackages = database.collection(BILLING_COLLECTIONS.creditPackages);
    this.orders = database.collection(BILLING_COLLECTIONS.orders);
    this.orderActions = database.collection(BILLING_COLLECTIONS.orderActions);
    this.reservations = database.collection(BILLING_COLLECTIONS.reservations);
    this.ledgerEntries = database.collection(BILLING_COLLECTIONS.ledgerEntries);
  }

  async getCreditPackage(packageId) {
    return getDocument(this.creditPackages, packageId);
  }

  async insertCreditPackage(record) {
    return insertUnique({
      collection: this.creditPackages,
      record,
      recordId: record.packageId,
      duplicateCode: "CREDIT_PACKAGE_ALREADY_EXISTS",
      duplicateMessage: `Credit package "${record.packageId}" already exists.`,
    });
  }

  async listCreditPackages() {
    return listDocuments(this.creditPackages);
  }

  async getOrder(orderId) {
    return getDocument(this.orders, orderId);
  }

  async findOrderByIdempotencyKey(idempotencyKey) {
    return findByIdempotencyKey(this.orders, idempotencyKey);
  }

  async insertOrder(record) {
    return insertUnique({
      collection: this.orders,
      record,
      recordId: record.id,
      idempotencyKey: record.idempotencyKey,
      duplicateCode: "ORDER_ALREADY_EXISTS",
      duplicateMessage: `Order "${record.id}" already exists.`,
    });
  }

  async updateOrderIfVersion(orderId, expectedVersion, nextRecord) {
    return updateIfVersion(this.orders, orderId, expectedVersion, nextRecord);
  }

  async findOrderActionByIdempotencyKey(idempotencyKey) {
    return findByIdempotencyKey(this.orderActions, idempotencyKey);
  }

  async insertOrderAction(record) {
    return insertUnique({
      collection: this.orderActions,
      record,
      recordId: record.id,
      idempotencyKey: record.idempotencyKey,
      duplicateCode: "ORDER_ACTION_ALREADY_EXISTS",
      duplicateMessage: `Order action "${record.id}" already exists.`,
    });
  }

  async getReservation(reservationId) {
    return getDocument(this.reservations, reservationId);
  }

  async findReservationByIdempotencyKey(idempotencyKey) {
    return findByIdempotencyKey(this.reservations, idempotencyKey);
  }

  async insertReservation(record) {
    return insertUnique({
      collection: this.reservations,
      record,
      recordId: record.id,
      idempotencyKey: record.idempotencyKey,
      duplicateCode: "RESERVATION_ALREADY_EXISTS",
      duplicateMessage: `Reservation "${record.id}" already exists.`,
    });
  }

  async updateReservationIfVersion(reservationId, expectedVersion, nextRecord) {
    return updateIfVersion(
      this.reservations,
      reservationId,
      expectedVersion,
      nextRecord,
    );
  }

  async findLedgerEntryByIdempotencyKey(idempotencyKey) {
    return findByIdempotencyKey(this.ledgerEntries, idempotencyKey);
  }

  async insertLedgerEntry(record) {
    return insertUnique({
      collection: this.ledgerEntries,
      record,
      recordId: record.id,
      idempotencyKey: record.idempotencyKey,
      duplicateCode: "LEDGER_ENTRY_ALREADY_EXISTS",
      duplicateMessage: `Ledger entry "${record.id}" already exists.`,
    });
  }

  async listLedgerEntriesByAccount(accountId) {
    const result = await this.ledgerEntries.where({ accountId }).get();
    return records(result);
  }

  async runInTransaction(work) {
    if (typeof this.database.runTransaction === "function") {
      return this.database.runTransaction((transaction) =>
        work(new CloudBaseBillingRepository(transaction)),
      );
    }

    if (typeof this.database.startTransaction !== "function") {
      throw new Error(
        "CloudBase database client does not expose transaction support.",
      );
    }

    const transaction = await this.database.startTransaction();
    const transactionRepository = new CloudBaseBillingRepository(transaction);
    try {
      const result = await work(transactionRepository);
      await commitTransaction(transaction);
      return result;
    } catch (error) {
      await rollbackTransaction(transaction);
      throw error;
    }
  }
}

async function commitTransaction(transaction) {
  if (typeof transaction.commit === "function") {
    await transaction.commit();
    return;
  }
  if (typeof transaction.commitTransaction === "function") {
    await transaction.commitTransaction();
    return;
  }
  throw new Error("CloudBase transaction does not expose commit().");
}

async function rollbackTransaction(transaction) {
  if (typeof transaction.rollback === "function") {
    await transaction.rollback();
    return;
  }
  if (typeof transaction.abort === "function") {
    await transaction.abort();
    return;
  }
  if (typeof transaction.abortTransaction === "function") {
    await transaction.abortTransaction();
    return;
  }
  throw new Error("CloudBase transaction does not expose rollback().");
}

async function insertUnique({
  collection,
  record,
  recordId,
  idempotencyKey,
  duplicateCode,
  duplicateMessage,
}) {
  if (idempotencyKey) {
    const duplicate = await findByIdempotencyKey(collection, idempotencyKey);
    if (duplicate) return null;
  }

  if (await getDocument(collection, recordId)) {
    throw new BillingError(duplicateCode, duplicateMessage, 409);
  }

  try {
    await createDocument(collection, recordId, record);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      if (idempotencyKey) {
        const duplicate = await findByIdempotencyKey(collection, idempotencyKey);
        if (duplicate) return null;
      }
      throw new BillingError(duplicateCode, duplicateMessage, 409);
    }
    throw error;
  }
  return cloneJson(record);
}

async function updateIfVersion(collection, recordId, expectedVersion, nextRecord) {
  const result = await collection
    .where({ id: recordId, version: expectedVersion })
    .update(nextRecord);
  return updateCount(result) === 1;
}

async function createDocument(collection, recordId, record) {
  if (typeof collection.add === "function") {
    await collection.add({ _id: recordId, ...record });
    return;
  }
  await collection.doc(recordId).set(record);
}

async function getDocument(collection, recordId) {
  return firstRecord(await collection.doc(recordId).get());
}

async function findByIdempotencyKey(collection, idempotencyKey) {
  if (!idempotencyKey) return null;
  return firstRecord(
    await collection.where({ idempotencyKey }).limit(1).get(),
  );
}

async function listDocuments(collection) {
  return records(await collection.get());
}

function records(result) {
  if (!result?.data) return [];
  return (Array.isArray(result.data) ? result.data : [result.data]).map(
    normalizeRecord,
  );
}

function firstRecord(result) {
  return records(result)[0] || null;
}

function updateCount(result) {
  return Number(
    result?.updated ??
      result?.modified ??
      result?.stats?.updated ??
      result?.stats?.modified ??
      0,
  );
}

function isDuplicateKeyError(error) {
  const code = String(error?.code || error?.errCode || "").toLowerCase();
  const message = String(error?.message || error?.errMsg || "").toLowerCase();
  return (
    code.includes("duplicate") ||
    code.includes("already_exist") ||
    message.includes("duplicate key") ||
    message.includes("already exists")
  );
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeRecord(value) {
  const record = cloneJson(value);
  if (record && typeof record === "object") delete record._id;
  return record;
}

module.exports = {
  BILLING_COLLECTIONS,
  CloudBaseBillingRepository,
};
