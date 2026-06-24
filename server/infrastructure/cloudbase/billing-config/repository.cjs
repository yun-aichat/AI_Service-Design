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

  async findActionPricingRecord(toolKey, actionKey) {
    const matches = records(
      await this.collections[COLLECTIONS.aiActionPricing]
        .where({ toolKey, actionKey })
        .limit(2)
        .get(),
    );
    if (matches.length > 1) {
      throw new Error(
        `Multiple action pricing records matched toolKey/actionKey "${toolKey}/${actionKey}".`,
      );
    }
    return matches[0] || null;
  }

  async updateActionPricingRecordIfVersion(recordId, expectedVersion, nextRecord) {
    return updateIfVersion(
      this.collections[COLLECTIONS.aiActionPricing],
      recordId,
      expectedVersion,
      nextRecord,
    );
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

function records(result) {
  if (!result?.data) return [];
  return Array.isArray(result.data) ? result.data : [result.data];
}

async function updateIfVersion(collection, recordId, expectedVersion, nextRecord) {
  const result = await collection
    .where({ id: recordId, version: expectedVersion })
    .update(nextRecord);
  return updateCount(result) === 1;
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

function firstRecord(result) {
  if (!result) return null;
  if (Array.isArray(result.data)) return result.data[0] || null;
  if (result.data && typeof result.data === "object") return result.data;
  return null;
}

module.exports = {
  CloudBaseBillingConfigRepository,
  COLLECTIONS,
};
