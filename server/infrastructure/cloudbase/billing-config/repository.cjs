const { COLLECTIONS } = require("../../../application/billing-config.cjs");

class CloudBaseBillingConfigRepository {
  constructor(database) {
    if (!database || typeof database.collection !== "function") {
      throw new Error("CloudBaseBillingConfigRepository requires a database client.");
    }

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

  async listRecords(collectionName, filters = {}) {
    const collection = getCollection(this.collections, collectionName);
    const query = compactFilters(filters);
    const result =
      Object.keys(query).length > 0 ? await collection.where(query).get() : await collection.get();
    return Array.isArray(result?.data) ? result.data : result?.data ? [result.data] : [];
  }

  async upsertRecord(collectionName, recordId, record) {
    await getCollection(this.collections, collectionName).doc(recordId).set(record);
    return record;
  }
}

function compactFilters(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null),
  );
}

function getCollection(collections, collectionName) {
  const collection = collections[collectionName];
  if (!collection) {
    throw new Error(`Unknown collection "${collectionName}".`);
  }
  return collection;
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
