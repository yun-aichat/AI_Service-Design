const { createBillingService } = require("./application/billing/index.cjs");
const {
  createBillingPortalService,
  normalizePortalError,
} = require("./application/billing-portal.cjs");
const {
  CloudBaseBillingRepository,
} = require("./infrastructure/cloudbase/billing/repository.cjs");

let cachedPortalService = null;

async function handleBillingPortal(request) {
  const user = await authenticateRequest(request);
  const body = await readJsonBody(request);
  const action = requireAction(body?.action);
  const service = getBillingPortalService();

  switch (action) {
    case "getMyCreditAccount":
      return service.getMyCreditAccount({ user });
    case "listCreditPackages":
      return service.listCreditPackages({
        user,
        enabled: body.enabled,
        limit: body.limit,
        offset: body.offset,
      });
    case "listMyLedgerEntries":
      return service.listMyLedgerEntries({
        user,
        operation: body.operation,
        referenceType: body.referenceType,
        limit: body.limit,
        offset: body.offset,
      });
    default:
      throw createUnknownActionError(action);
  }
}

function nodeHandler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Only POST is supported.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  handleBillingPortal(request)
    .then((result) => sendJson(response, 200, result))
    .catch((error) => {
      const normalized = normalizePortalError(error);
      sendJson(response, Number.isInteger(normalized?.status) ? normalized.status : 500, {
        error: normalized instanceof Error ? normalized.message : "Billing request failed.",
        code: normalized?.code || "BILLING_PORTAL_ERROR",
      });
    });
}

function getBillingPortalService() {
  if (cachedPortalService) return cachedPortalService;

  const database = resolveCloudBaseDatabase();
  const repository = new CloudBaseBillingRepository(database);
  cachedPortalService = createBillingPortalService({
    billingRepository: repository,
    billingService: createBillingService({ repository }),
  });
  return cachedPortalService;
}

function resolveCloudBaseDatabase() {
  if (globalThis.__cloudbaseDatabase) {
    return globalThis.__cloudbaseDatabase;
  }
  if (globalThis.tcb && typeof globalThis.tcb.database === "function") {
    return globalThis.tcb.database();
  }
  if (globalThis.cloudbase && typeof globalThis.cloudbase.database === "function") {
    return globalThis.cloudbase.database();
  }

  const error = new Error("CloudBase database client is not configured for billing APIs.");
  error.code = "CLOUDBASE_DATABASE_UNAVAILABLE";
  error.status = 500;
  throw error;
}

async function authenticateRequest(request) {
  const { CloudBaseAccessTokenVerifier, readBearerToken } = await import(
    "./infrastructure/cloudbase/auth/verify-access-token.mjs"
  );
  const token = readBearerToken(request.headers.authorization);
  if (!token) {
    const error = new Error("A signed-in user is required.");
    error.code = "UNAUTHENTICATED";
    error.status = 401;
    throw error;
  }

  const profile = await new CloudBaseAccessTokenVerifier().verify(token);
  if (!profile) {
    const error = new Error("A signed-in user is required.");
    error.code = "UNAUTHENTICATED";
    error.status = 401;
    throw error;
  }
  return profile;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        const error = new Error("Request body is too large.");
        error.code = "PAYLOAD_TOO_LARGE";
        error.status = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error("Request body must be JSON.");
        error.code = "INVALID_JSON";
        error.status = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function requireAction(value) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error("action is required.");
    error.code = "INVALID_INPUT";
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function createUnknownActionError(action) {
  const error = new Error(`Unsupported billing action "${action}".`);
  error.code = "UNKNOWN_ACTION";
  error.status = 404;
  return error;
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

module.exports = {
  getBillingPortalService,
  handleBillingPortal,
  nodeHandler,
};
