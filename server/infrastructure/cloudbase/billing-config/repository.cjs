const { COLLECTIONS } = require("../../../application/billing-config.cjs");

class CloudBaseBillingConfigRepository {
  constructor(database) {
    if (!database || typeof database.collection !== "function") {
      throw new Error("CloudBaseBillingConfigRepository requires a database client.");
    }

    this.database = database;
    this.collections = {
      [COLLECTIONS.creditPackages]: database.collection(COLLECTIONS.creditPackages),
      [COLLECTIONS.aiActionPricing]: database.collection(COLLECTIONS.aiActionPricing),
      [COLLECTIONS.aiModelPolicies]: database.collection(COLLECTIONS.aiModelPolicies),
      [COLLECTIONS.creditLedger]: database.collection(COLLECTIONS.creditLedger),
      [COLLECTIONS.aiUsageEvents]: database.collection(COLLECTIONS.aiUsageEvents),
    };
  }

  async getRecord(collectionName, recordId) {
    const result = await getCollection(this.collections, collectionName).doc(recordId).get();
    return firstRecord(result);
  }

  async listRecords(collectionName, options = {}) {
    const collection = getCollection(this.collections, collectionName);
    const limit = requirePageSize(options.limit);
    const offset = requireOffset(options.offset);
    const sortBy = requireSortKey(options.sortBy);
    const sortDirection = requireSortDirection(options.sortDirection);
    const query = buildQuery(this.database, {
      filters: options.filters || {},
      createdFrom: options.createdFrom,
      createdTo: options.createdTo,
    });

    const reader = applyQuery(collection, query)
      .orderBy(sortBy, sortDirection)
      .skip(offset)
      .limit(limit);
    const [listResult, countResult] = await Promise.all([
      reader.get(),
      applyQuery(collection, query).count(),
    ]);

    return {
      items: Array.isArray(listResult?.data)
        ? listResult.data
        : listResult?.data
          ? [listResult.data]
          : [],
      total: Number(countResult?.total ?? countResult?.count ?? 0),
    };
  }

  async upsertRecord(collectionName, recordId, record) {
    await getCollection(this.collections, collectionName).doc(recordId).set(record);
    return record;
  }

  async deleteRecord(collectionName, recordId) {
    const collection = getCollection(this.collections, collectionName);
    if (typeof collection.doc(recordId).remove === "function") {
      const result = await collection.doc(recordId).remove();
      return deleteCount(result) === 1 || deleteCount(result) === 0;
    }
    await collection.doc(recordId).set(null);
    return true;
  }

  async saveRecordWithVersion(collectionName, recordId, expectedVersion, record) {
    const collection = getCollection(this.collections, collectionName);
    if (expectedVersion === 0) {
      if (await getDocument(collection, recordId)) {
        return false;
      }
      try {
        await createDocument(collection, recordId, record);
        return true;
      } catch (error) {
        if (isDuplicateKeyError(error)) return false;
        throw error;
      }
    }

    const result = await collection.where({ id: recordId, version: expectedVersion }).update(record);
    return updateCount(result) === 1;
  }
}

function compactFilters(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null),
  );
}

function buildQuery(database, input) {
  const query = compactFilters(input.filters || {});
  const createdFrom = normalizeDateBoundary(input.createdFrom, "createdFrom");
  const createdTo = normalizeDateBoundary(input.createdTo, "createdTo");
  if (!createdFrom && !createdTo) return query;

  const command = database?.command;
  const hasGte = typeof command?.gte === "function";
  const hasLte = typeof command?.lte === "function";
  const hasAnd = typeof command?.and === "function";
  if ((createdFrom && !createdTo && hasGte) || (!createdFrom && createdTo && hasLte)) {
    if (createdFrom) {
      query.createdAt = command.gte(createdFrom);
    } else {
      query.createdAt = command.lte(createdTo);
    }
    return query;
  }

  if (createdFrom && createdTo && hasGte && hasLte && hasAnd) {
    if (createdFrom && createdTo) {
      query.createdAt = command.and([command.gte(createdFrom), command.lte(createdTo)]);
    }
    return query;
  }

  query.createdAt = {
    __billingRange: true,
    gte: createdFrom,
    lte: createdTo,
  };
  return query;
}

function applyQuery(collection, query) {
  return Object.keys(query).length > 0 ? collection.where(query) : collection;
}

function getCollection(collections, collectionName) {
  const collection = collections[collectionName];
  if (!collection) {
    throw new Error(`Unknown collection "${collectionName}".`);
  }
  return collection;
}

function normalizeDateBoundary(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${field} must be an ISO date string.`);
  }
  return normalized;
}

function requirePageSize(value) {
  if (value === undefined || value === null) return 50;
  if (!Number.isInteger(value) || value < 1 || value > 200) {
    throw new Error("limit must be an integer between 1 and 200.");
  }
  return value;
}

function requireOffset(value) {
  if (value === undefined || value === null) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("offset must be a non-negative integer.");
  }
  return value;
}

function requireSortKey(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "updatedAt";
}

function requireSortDirection(value) {
  const direction = typeof value === "string" && value.trim() ? value.trim() : "desc";
  if (!["asc", "desc"].includes(direction)) {
    throw new Error("sortDirection must be asc or desc.");
  }
  return direction;
}

function firstRecord(result) {
  if (!result) return null;
  if (Array.isArray(result.data)) return result.data[0] || null;
  if (result.data && typeof result.data === "object") return result.data;
  return null;
}

async function getDocument(collection, recordId) {
  return firstRecord(await collection.doc(recordId).get());
}

async function createDocument(collection, recordId, record) {
  if (typeof collection.add === "function") {
    await collection.add({ _id: recordId, ...record });
    return;
  }
  await collection.doc(recordId).set(record);
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

function deleteCount(result) {
  return Number(
    result?.deleted ??
      result?.removed ??
      result?.stats?.removed ??
      result?.stats?.deleted ??
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

module.exports = {
  CloudBaseBillingConfigRepository,
  COLLECTIONS,
};
