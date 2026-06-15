const { BillingError } = require("./billing/index.cjs");

class BillingPortalError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "BillingPortalError";
    this.code = code;
    this.status = status;
  }
}

function createBillingPortalService({
  billingService,
  billingRepository,
} = {}) {
  if (!billingService) {
    throw new BillingPortalError(
      "BILLING_SERVICE_REQUIRED",
      "Billing portal requires a billing service.",
      500,
    );
  }
  if (!billingRepository) {
    throw new BillingPortalError(
      "BILLING_REPOSITORY_REQUIRED",
      "Billing portal requires a billing repository.",
      500,
    );
  }

  async function getMyCreditAccount(input = {}) {
    const user = assertAuthenticatedUser(input.user);
    return billingService.getCreditAccount({ accountId: user.id });
  }

  async function listCreditPackages(input = {}) {
    assertAuthenticatedUser(input.user);
    const limit = requirePageSize(input.limit, 20);
    const offset = requireOffset(input.offset);
    const enabledOnly = input.enabled !== false;
    const matched = sortPackages(
      await billingService.listCreditPackages({ enabledOnly }),
    );
    return pageItems(matched, { limit, offset });
  }

  async function listMyLedgerEntries(input = {}) {
    const user = assertAuthenticatedUser(input.user);
    const limit = requirePageSize(input.limit, 20);
    const offset = requireOffset(input.offset);
    const operation = optionalString(input.operation);
    const referenceType = optionalString(input.referenceType);
    const matched = sortLedgerEntries(
      (await billingRepository.listLedgerEntriesByAccount(user.id)).filter((entry) => {
        if (operation && entry.operation !== operation) return false;
        if (referenceType && entry.referenceType !== referenceType) return false;
        return true;
      }),
    );

    return pageItems(matched, { limit, offset });
  }

  return {
    getMyCreditAccount,
    listCreditPackages,
    listMyLedgerEntries,
  };
}

function pageItems(items, { limit, offset }) {
  const pageItems = items.slice(offset, offset + limit);
  return {
    items: pageItems,
    page: {
      limit,
      offset,
      total: items.length,
      hasMore: offset + pageItems.length < items.length,
    },
  };
}

function sortPackages(items) {
  return [...items].sort((left, right) => {
    const leftOrder = Number.isFinite(left?.sortOrder) ? left.sortOrder : 0;
    const rightOrder = Number.isFinite(right?.sortOrder) ? right.sortOrder : 0;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    const updatedAtOrder = compareIsoDates(right?.updatedAt, left?.updatedAt);
    if (updatedAtOrder !== 0) return updatedAtOrder;

    return String(left?.packageId || "").localeCompare(String(right?.packageId || ""));
  });
}

function sortLedgerEntries(items) {
  return [...items].sort((left, right) => {
    const createdAtOrder = compareIsoDates(right?.createdAt, left?.createdAt);
    if (createdAtOrder !== 0) return createdAtOrder;
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
}

function compareIsoDates(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function assertAuthenticatedUser(user) {
  if (!user?.id) {
    throw new BillingPortalError("UNAUTHENTICATED", "A signed-in user is required.", 401);
  }
  return user;
}

function requirePageSize(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new BillingPortalError("INVALID_INPUT", "limit must be an integer between 1 and 100.");
  }
  return value;
}

function requireOffset(value) {
  if (value === undefined || value === null) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new BillingPortalError("INVALID_INPUT", "offset must be a non-negative integer.");
  }
  return value;
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim() || null;
}

function normalizePortalError(error) {
  if (error instanceof BillingPortalError) return error;
  if (error instanceof BillingError) {
    return new BillingPortalError(error.code || "BILLING_ERROR", error.message, error.status || 400);
  }
  return error;
}

module.exports = {
  BillingPortalError,
  createBillingPortalService,
  normalizePortalError,
};
