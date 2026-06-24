const COLLECTIONS = Object.freeze({
  creditPackages: "credit_packages",
  aiActionPricing: "ai_action_pricing",
  aiModelPolicies: "ai_model_policies",
  creditLedger: "credit_ledger",
  aiUsageEvents: "ai_usage_events",
});

const ADMIN_ROLES = Object.freeze(["admin", "billing-admin"]);
const MODEL_POLICY_COMMAND_FIELDS = Object.freeze([
  "toolKey",
  "actionKey",
  "providerKey",
  "modelKey",
  "endpoint",
  "apiKeyRef",
  "temperature",
  "maxInputTokens",
  "maxOutputTokens",
  "timeoutMs",
  "enabled",
  "expectedVersion",
]);

class BillingConfigError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "BillingConfigError";
    this.code = code;
    this.status = status;
  }
}

class InMemoryBillingConfigRepository {
  constructor(seed = {}) {
    this.collections = {
      [COLLECTIONS.creditPackages]: new Map(
        Object.entries(seed.creditPackages || {}).map(([id, value]) => [id, cloneJson(value)]),
      ),
      [COLLECTIONS.aiActionPricing]: new Map(
        Object.entries(seed.aiActionPricing || {}).map(([id, value]) => [id, cloneJson(value)]),
      ),
      [COLLECTIONS.aiModelPolicies]: new Map(
        Object.entries(seed.aiModelPolicies || {}).map(([id, value]) => [id, cloneJson(value)]),
      ),
      [COLLECTIONS.creditLedger]: new Map(
        Object.entries(seed.creditLedger || {}).map(([id, value]) => [id, cloneJson(value)]),
      ),
      [COLLECTIONS.aiUsageEvents]: new Map(
        Object.entries(seed.aiUsageEvents || {}).map(([id, value]) => [id, cloneJson(value)]),
      ),
    };
  }

  async getRecord(collectionName, recordId) {
    const collection = requireCollection(this.collections, collectionName);
    return cloneJson(collection.get(recordId) || null);
  }

  async listRecords(collectionName, options = {}) {
    const collection = requireCollection(this.collections, collectionName);
    const filters = options.filters || {};
    const createdFrom = normalizeDateBoundary(options.createdFrom, "createdFrom");
    const createdTo = normalizeDateBoundary(options.createdTo, "createdTo");
    const sortBy = requireSortKey(options.sortBy);
    const sortDirection = requireSortDirection(options.sortDirection);
    const limit = requirePageSize(options.limit);
    const offset = requireOffset(options.offset);

    const matched = [...collection.values()]
      .filter((record) =>
        Object.entries(filters).every(([key, value]) =>
          value === undefined || value === null ? true : record?.[key] === value,
        ),
      )
      .filter((record) => {
        const createdAt = String(record?.createdAt || "");
        if (createdFrom && createdAt < createdFrom) return false;
        if (createdTo && createdAt > createdTo) return false;
        return true;
      });

    const sorted = sortRecords(matched, sortBy, sortDirection);
    return {
      items: sorted.slice(offset, offset + limit).map((record) => cloneJson(record)),
      total: sorted.length,
    };
  }

  async upsertRecord(collectionName, recordId, record) {
    const collection = requireCollection(this.collections, collectionName);
    collection.set(recordId, cloneJson(record));
    return cloneJson(record);
  }

  async saveRecordWithVersion(collectionName, recordId, expectedVersion, record) {
    const collection = requireCollection(this.collections, collectionName);
    const current = collection.get(recordId);
    if (!current) {
      if (expectedVersion !== 0) return false;
      collection.set(recordId, cloneJson(record));
      return true;
    }
    if (current.version !== expectedVersion) return false;
    collection.set(recordId, cloneJson(record));
    return true;
  }
}

function createBillingConfigService({
  repository,
  now = () => new Date().toISOString(),
  createId = defaultCreateId,
} = {}) {
  if (!repository) {
    throw new BillingConfigError(
      "REPOSITORY_REQUIRED",
      "Billing config service requires a repository.",
    );
  }

  async function listCreditPackages(input = {}) {
    assertAuthenticatedUser(input.user);
    return listCollection({
      collectionName: COLLECTIONS.creditPackages,
      filters: pickDefinedFilters(input, ["packageId", "currency", "enabled"]),
      sortBy: optionalString(input.sortBy) || "updatedAt",
      sortDirection: optionalString(input.sortDirection) || "desc",
      limit: input.limit,
      offset: input.offset,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
    });
  }

  async function listAiActionPricing(input = {}) {
    assertAuthenticatedUser(input.user);
    return listCollection({
      collectionName: COLLECTIONS.aiActionPricing,
      filters: pickDefinedFilters(input, [
        "pricingId",
        "toolKey",
        "actionKey",
        "tierKey",
        "enabled",
      ]),
      sortBy: optionalString(input.sortBy) || "updatedAt",
      sortDirection: optionalString(input.sortDirection) || "desc",
      limit: input.limit,
      offset: input.offset,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
    });
  }

  async function listAiModelPolicies(input = {}) {
    assertAuthenticatedUser(input.user);
    const page = await listCollection({
      collectionName: COLLECTIONS.aiModelPolicies,
      filters: pickDefinedFilters(
        {
          policyId: input.policyId,
          toolKey: input.toolKey,
          actionKey: input.actionKey,
          providerKey: input.providerKey ?? input.provider,
          modelKey: input.modelKey ?? input.model,
          enabled: input.enabled,
        },
        ["policyId", "toolKey", "actionKey", "providerKey", "modelKey", "enabled"],
      ),
      sortBy: optionalString(input.sortBy) || "updatedAt",
      sortDirection: optionalString(input.sortDirection) || "desc",
      limit: input.limit,
      offset: input.offset,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
    });

    return {
      ...page,
      items: page.items.map((record) => normalizeAiModelPolicyRecord(record)),
    };
  }

  async function listCreditLedger(input = {}) {
    assertAdminUser(input.user);
    return listCollection({
      collectionName: COLLECTIONS.creditLedger,
      filters: pickDefinedFilters(input, [
        "accountId",
        "userId",
        "orderId",
        "reservationId",
        "referenceType",
        "referenceId",
        "operation",
      ]),
      sortBy: optionalString(input.sortBy) || "createdAt",
      sortDirection: optionalString(input.sortDirection) || "desc",
      limit: input.limit,
      offset: input.offset,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
    });
  }

  async function listAiUsageEvents(input = {}) {
    assertAdminUser(input.user);
    return listCollection({
      collectionName: COLLECTIONS.aiUsageEvents,
      filters: pickDefinedFilters(input, [
        "userId",
        "projectId",
        "documentId",
        "toolKey",
        "actionKey",
        "tierKey",
        "provider",
        "model",
        "status",
        "billingStatus",
        "referenceId",
      ]),
      sortBy: optionalString(input.sortBy) || "createdAt",
      sortDirection: optionalString(input.sortDirection) || "desc",
      limit: input.limit,
      offset: input.offset,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
    });
  }

  async function upsertCreditPackage(input = {}) {
    const user = assertAdminUser(input.user);
    const record = validateCreditPackage(input.record || {});
    const existing = await repository.getRecord(COLLECTIONS.creditPackages, record.packageId);
    const timestamp = now();
    const nextRecord = {
      ...existing,
      ...record,
      id: record.packageId,
      packageId: record.packageId,
      createdAt: existing?.createdAt || timestamp,
      createdBy: existing?.createdBy || user.id,
      updatedAt: timestamp,
      updatedBy: user.id,
    };
    await repository.upsertRecord(COLLECTIONS.creditPackages, record.packageId, nextRecord);
    return nextRecord;
  }

  async function upsertAiActionPricing(input = {}) {
    const user = assertAdminUser(input.user);
    const record = validateAiActionPricing(input.record || {});
    const pricingId = record.pricingId || `${record.toolKey}:${record.actionKey}:${record.tierKey}`;
    const existing = await repository.getRecord(COLLECTIONS.aiActionPricing, pricingId);
    const timestamp = now();
    const nextRecord = {
      ...existing,
      ...record,
      id: pricingId,
      pricingId,
      createdAt: existing?.createdAt || timestamp,
      createdBy: existing?.createdBy || user.id,
      updatedAt: timestamp,
      updatedBy: user.id,
    };
    await repository.upsertRecord(COLLECTIONS.aiActionPricing, pricingId, nextRecord);
    return nextRecord;
  }

  async function updateModelPolicy(input = {}) {
    const user = assertAdminUser(input.user);
    const command = validateModelPolicyCommand(input.command || {});
    const policyId = command.policyId;
    const existing = await repository.getRecord(COLLECTIONS.aiModelPolicies, policyId);
    const currentVersion = existing ? requireStoredVersion(existing.version) : 0;
    if (currentVersion !== command.expectedVersion) {
      throw new BillingConfigError(
        "VERSION_CONFLICT",
        `Model policy version conflict for \"${policyId}\". Expected ${command.expectedVersion}, found ${currentVersion}.`,
        409,
      );
    }

    const timestamp = now();
    const nextRecord = normalizeAiModelPolicyRecord({
      ...existing,
      ...command,
      id: policyId,
      policyId,
      createdAt: existing?.createdAt || timestamp,
      createdBy: existing?.createdBy || user.id,
      updatedAt: timestamp,
      updatedBy: user.id,
      version: currentVersion + 1,
    });

    const saved = repository.saveRecordWithVersion
      ? await repository.saveRecordWithVersion(
          COLLECTIONS.aiModelPolicies,
          policyId,
          command.expectedVersion,
          nextRecord,
        )
      : (await repository.upsertRecord(COLLECTIONS.aiModelPolicies, policyId, nextRecord), true);

    if (!saved) {
      throw new BillingConfigError(
        "VERSION_CONFLICT",
        `Model policy version conflict for \"${policyId}\".`,
        409,
      );
    }

    return nextRecord;
  }

  async function upsertAiModelPolicy(input = {}) {
    return updateModelPolicy({
      user: input.user,
      command: translateLegacyModelPolicyRecord(input.record || {}),
    });
  }

  async function listCollection(input) {
    const limit = requirePageSize(input.limit);
    const offset = requireOffset(input.offset);
    const sortBy = requireSortKey(input.sortBy);
    const sortDirection = requireSortDirection(input.sortDirection);
    const pageResult = await repository.listRecords(input.collectionName, {
      filters: input.filters,
      sortBy,
      sortDirection,
      limit,
      offset,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
    });
    const items = pageResult.items;

    return {
      items,
      page: {
        limit,
        offset,
        total: pageResult.total,
        hasMore: offset + items.length < pageResult.total,
      },
    };
  }

  async function recordAiUsageEvent(input = {}) {
    const record = validateAiUsageEvent(input.record || {});
    const eventId = record.id || `${record.referenceId}:${record.status}`;
    const timestamp = now();
    const totalTokens =
      typeof record.totalTokens === "number"
        ? record.totalTokens
        : typeof record.inputTokens === "number" && typeof record.outputTokens === "number"
          ? record.inputTokens + record.outputTokens
          : null;

    const nextRecord = {
      id: eventId,
      userId: record.userId || null,
      projectId: record.projectId || null,
      documentId: record.documentId || null,
      toolKey: record.toolKey,
      actionKey: record.actionKey,
      tierKey: record.tierKey,
      provider: record.provider,
      model: record.model,
      inputTokens: typeof record.inputTokens === "number" ? record.inputTokens : null,
      outputTokens: typeof record.outputTokens === "number" ? record.outputTokens : null,
      totalTokens,
      estimatedCostValue:
        typeof record.estimatedCostValue === "number" ? record.estimatedCostValue : null,
      chargedCredits: typeof record.chargedCredits === "number" ? record.chargedCredits : 0,
      status: record.status,
      billingStatus: record.billingStatus || null,
      referenceId: record.referenceId,
      createdAt: timestamp,
    };

    await repository.upsertRecord(COLLECTIONS.aiUsageEvents, eventId, nextRecord);
    return nextRecord;
  }

  return {
    listAiActionPricing,
    listAiModelPolicies,
    listAiUsageEvents,
    listCreditLedger,
    listCreditPackages,
    recordAiUsageEvent,
    updateModelPolicy,
    upsertAiActionPricing,
    upsertAiModelPolicy,
    upsertCreditPackage,
  };
}

function validateCreditPackage(input) {
  const packageId = requireString(input.packageId, "record.packageId");
  const record = {
    packageId,
    displayName: requireString(input.displayName, "record.displayName"),
    credits: requirePositiveInteger(input.credits, "record.credits"),
    bonusCredits: requireNonNegativeInteger(input.bonusCredits ?? 0, "record.bonusCredits"),
    priceValue: requireNonNegativeInteger(input.priceValue, "record.priceValue"),
    currency: requireCurrency(input.currency),
    enabled: requireBoolean(input.enabled, "record.enabled"),
    validityDays:
      input.validityDays === null || input.validityDays === undefined
        ? null
        : requirePositiveInteger(input.validityDays, "record.validityDays"),
    channelScope: normalizeStringArray(input.channelScope, "record.channelScope"),
    description: optionalString(input.description),
    sortOrder: requireNonNegativeInteger(input.sortOrder ?? 0, "record.sortOrder"),
    metadata: cloneJson(input.metadata || null),
  };
  return record;
}

function validateAiActionPricing(input) {
  const toolKey = requireString(input.toolKey, "record.toolKey");
  const actionKey = requireString(input.actionKey, "record.actionKey");
  const tierKey = requireString(input.tierKey, "record.tierKey");
  const derivedPricingId = `${toolKey}:${actionKey}:${tierKey}`;
  const providedPricingId = optionalString(input.pricingId);
  if (providedPricingId && providedPricingId !== derivedPricingId) {
    throw new BillingConfigError(
      "INVALID_INPUT",
      "pricingId must match toolKey:actionKey:tierKey.",
    );
  }
  return {
    pricingId: derivedPricingId,
    toolKey,
    actionKey,
    tierKey,
    displayName: requireString(input.displayName, "record.displayName"),
    creditCost: requireNonNegativeInteger(input.creditCost, "record.creditCost"),
    enabled: requireBoolean(input.enabled, "record.enabled"),
    description: optionalString(input.description),
    metadata: cloneJson(input.metadata || null),
  };
}

function validateModelPolicyCommand(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BillingConfigError("INVALID_INPUT", "command must be a non-null object.");
  }
  assertAllowedFields(input, MODEL_POLICY_COMMAND_FIELDS, "model policy");

  const toolKey = requireString(input.toolKey, "command.toolKey");
  const actionKey = requireString(input.actionKey, "command.actionKey");
  const providerKey = requireString(input.providerKey, "command.providerKey");
  const modelKey = requireString(input.modelKey, "command.modelKey");

  return {
    policyId: buildModelPolicyId(toolKey, actionKey),
    toolKey,
    actionKey,
    providerKey,
    modelKey,
    provider: providerKey,
    model: modelKey,
    endpoint: optionalNullableString(input.endpoint, "command.endpoint"),
    apiKeyRef: requireString(input.apiKeyRef, "command.apiKeyRef"),
    temperature: requireFiniteNumber(input.temperature, "command.temperature"),
    maxInputTokens: requirePositiveInteger(input.maxInputTokens, "command.maxInputTokens"),
    maxOutputTokens: requirePositiveInteger(input.maxOutputTokens, "command.maxOutputTokens"),
    timeoutMs: requirePositiveInteger(input.timeoutMs, "command.timeoutMs"),
    enabled: requireBoolean(input.enabled, "command.enabled"),
    expectedVersion: requireNonNegativeInteger(input.expectedVersion, "command.expectedVersion"),
  };
}

function translateLegacyModelPolicyRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new BillingConfigError("INVALID_INPUT", "record must be a non-null object.");
  }
  return {
    toolKey: record.toolKey,
    actionKey: record.actionKey,
    providerKey: record.providerKey ?? record.provider,
    modelKey: record.modelKey ?? record.model,
    endpoint: record.endpoint ?? null,
    apiKeyRef: record.apiKeyRef,
    temperature: record.temperature,
    maxInputTokens: record.maxInputTokens,
    maxOutputTokens: record.maxOutputTokens,
    timeoutMs: record.timeoutMs,
    enabled: record.enabled,
    expectedVersion: record.expectedVersion ?? record.version ?? 0,
  };
}

function normalizeAiModelPolicyRecord(record) {
  if (!record || typeof record !== "object") return record;
  const providerKey = safeOptionalString(record.providerKey) || safeOptionalString(record.provider);
  const modelKey = safeOptionalString(record.modelKey) || safeOptionalString(record.model);
  return {
    ...cloneJson(record),
    policyId:
      safeOptionalString(record.policyId) ||
      (safeOptionalString(record.toolKey) && safeOptionalString(record.actionKey)
        ? buildModelPolicyId(record.toolKey, record.actionKey)
        : null),
    providerKey,
    modelKey,
    provider: providerKey,
    model: modelKey,
    endpoint: safeOptionalString(record.endpoint),
    apiKeyRef: safeOptionalString(record.apiKeyRef),
  };
}

function buildModelPolicyId(toolKey, actionKey) {
  return `${toolKey}:${actionKey}`;
}

function validateAiUsageEvent(record) {
  if (!record || typeof record !== "object") {
    throw new BillingConfigError("INVALID_INPUT", "record must be a non-null object.");
  }

  const status = requireString(record.status, "record.status");
  if (!["started", "succeeded", "failed", "cancelled"].includes(status)) {
    throw new BillingConfigError(
      "INVALID_INPUT",
      "record.status must be one of: started, succeeded, failed, cancelled.",
    );
  }

  const billingStatus = optionalString(record.billingStatus);
  if (billingStatus && !["charged", "not_charged"].includes(billingStatus)) {
    throw new BillingConfigError(
      "INVALID_INPUT",
      "record.billingStatus must be one of: charged, not_charged.",
    );
  }

  return {
    id: optionalString(record.id),
    userId: optionalString(record.userId),
    projectId: optionalString(record.projectId),
    documentId: optionalString(record.documentId),
    toolKey: requireString(record.toolKey, "record.toolKey"),
    actionKey: requireString(record.actionKey, "record.actionKey"),
    tierKey: requireString(record.tierKey, "record.tierKey"),
    provider: requireString(record.provider, "record.provider"),
    model: requireString(record.model, "record.model"),
    inputTokens:
      record.inputTokens === undefined || record.inputTokens === null
        ? null
        : requireNonNegativeInteger(record.inputTokens, "record.inputTokens"),
    outputTokens:
      record.outputTokens === undefined || record.outputTokens === null
        ? null
        : requireNonNegativeInteger(record.outputTokens, "record.outputTokens"),
    totalTokens:
      record.totalTokens === undefined || record.totalTokens === null
        ? null
        : requireNonNegativeInteger(record.totalTokens, "record.totalTokens"),
    estimatedCostValue:
      record.estimatedCostValue === undefined || record.estimatedCostValue === null
        ? null
        : requireFiniteNumber(record.estimatedCostValue, "record.estimatedCostValue"),
    chargedCredits:
      record.chargedCredits === undefined || record.chargedCredits === null
        ? 0
        : requireNonNegativeInteger(record.chargedCredits, "record.chargedCredits"),
    status,
    billingStatus,
    referenceId: requireString(record.referenceId, "record.referenceId"),
  };
}

function sortRecords(records, sortBy, sortDirection) {
  const modifier = sortDirection === "asc" ? 1 : -1;
  return [...records].sort((left, right) => {
    const leftValue = sortableValue(left?.[sortBy]);
    const rightValue = sortableValue(right?.[sortBy]);
    if (leftValue === rightValue) {
      return String(left?.id || "").localeCompare(String(right?.id || "")) * modifier;
    }
    return leftValue < rightValue ? -1 * modifier : 1 * modifier;
  });
}

function sortableValue(value) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value ?? "");
}

function pickDefinedFilters(input, fields) {
  return fields.reduce((result, field) => {
    if (input[field] !== undefined && input[field] !== null && input[field] !== "") {
      result[field] = input[field];
    }
    return result;
  }, {});
}

function assertAuthenticatedUser(user) {
  if (!user?.id) {
    throw new BillingConfigError("UNAUTHENTICATED", "A signed-in user is required.", 401);
  }
  return user;
}

function assertAdminUser(user) {
  assertAuthenticatedUser(user);
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (!roles.some((role) => ADMIN_ROLES.includes(String(role)))) {
    throw new BillingConfigError(
      "FORBIDDEN",
      "Billing admin access is required.",
      403,
    );
  }
  return user;
}

function assertAllowedFields(input, allowedFields, label) {
  const unsupported = Object.keys(input).filter((key) => !allowedFields.includes(key));
  if (unsupported.length > 0) {
    throw new BillingConfigError(
      "INVALID_INPUT",
      `Unsupported ${label} fields: ${unsupported.join(", ")}.`,
    );
  }
}

function requireStoredVersion(value) {
  return requireNonNegativeInteger(value ?? 0, "record.version");
}

function requireCollection(collections, collectionName) {
  const collection = collections[collectionName];
  if (!collection) {
    throw new BillingConfigError(
      "UNKNOWN_COLLECTION",
      `Unknown collection "${collectionName}".`,
    );
  }
  return collection;
}

function normalizeDateBoundary(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = requireString(value, field);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new BillingConfigError("INVALID_INPUT", `${field} must be an ISO date string.`);
  }
  return normalized;
}

function normalizeStringArray(value, field) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new BillingConfigError("INVALID_INPUT", `${field} must be an array of strings.`);
  }
  return [...new Set(value.map((entry, index) => requireString(entry, `${field}[${index}]`)))];
}

function requirePageSize(value) {
  if (value === undefined || value === null) return 50;
  if (!Number.isInteger(value) || value < 1 || value > 200) {
    throw new BillingConfigError("INVALID_INPUT", "limit must be an integer between 1 and 200.");
  }
  return value;
}

function requireOffset(value) {
  if (value === undefined || value === null) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new BillingConfigError("INVALID_INPUT", "offset must be a non-negative integer.");
  }
  return value;
}

function requireSortDirection(value) {
  const direction = optionalString(value) || "desc";
  if (!["asc", "desc"].includes(direction)) {
    throw new BillingConfigError("INVALID_INPUT", "sortDirection must be asc or desc.");
  }
  return direction;
}

function requireSortKey(value) {
  return optionalString(value) || "updatedAt";
}

function requireCurrency(value) {
  const currency = requireString(value, "record.currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BillingConfigError("INVALID_INPUT", "currency must be an ISO-4217 style code.");
  }
  return currency;
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new BillingConfigError("INVALID_INPUT", `${field} must be a boolean.`);
  }
  return value;
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new BillingConfigError("INVALID_INPUT", `${field} must be a positive integer.`);
  }
  return value;
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new BillingConfigError("INVALID_INPUT", `${field} must be a non-negative integer.`);
  }
  return value;
}

function requireFiniteNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BillingConfigError("INVALID_INPUT", `${field} must be a finite number.`);
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BillingConfigError("INVALID_INPUT", `${field} is required.`);
  }
  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return requireString(value, "value");
}

function optionalNullableString(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return requireString(value, field);
}

function safeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function defaultCreateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

module.exports = {
  ADMIN_ROLES,
  BillingConfigError,
  COLLECTIONS,
  InMemoryBillingConfigRepository,
  createBillingConfigService,
};
