const {
  BillingConfigError,
  createBillingConfigService,
} = require("./application/billing-config.cjs");
const {
  CloudBaseBillingConfigRepository,
} = require("./infrastructure/cloudbase/billing-config/repository.cjs");

let cachedService = null;

async function handleBillingConfig(request) {
  const user = await authenticateRequest(request);
  const body = await readJsonBody(request);
  const action = requireAction(body?.action);
  const service = getBillingConfigService();

  switch (action) {
    case "listCreditPackages":
      return service.listCreditPackages({ ...body, user });
    case "listAiActionPricing":
      return service.listAiActionPricing({ ...body, user });
    case "listAiModelPolicies":
      return service.listAiModelPolicies({ ...body, user });
    case "listCreditLedger":
      return service.listCreditLedger({ ...body, user });
    case "listAiUsageEvents":
      return service.listAiUsageEvents({ ...body, user });
    case "upsertCreditPackage":
      return service.upsertCreditPackage({ ...body, user });
    case "upsertAiActionPricing":
      return service.upsertAiActionPricing({ ...body, user });
    case "upsertAiModelPolicy":
      return service.upsertAiModelPolicy({ ...body, user });
    default:
      throw new BillingConfigError(
        "UNKNOWN_ACTION",
        `Unsupported billing config action "${action}".`,
        404,
      );
  }
}

function nodeHandler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Only POST is supported.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  handleBillingConfig(request)
    .then((result) => sendJson(response, 200, result))
    .catch((error) => {
      sendJson(response, Number.isInteger(error?.status) ? error.status : 500, {
        error: error instanceof Error ? error.message : "Billing config request failed.",
        code: error?.code || "BILLING_CONFIG_ERROR",
      });
    });
}

function getBillingConfigService() {
  if (cachedService) return cachedService;

  const database = resolveCloudBaseDatabase();
  cachedService = createBillingConfigService({
    repository: new CloudBaseBillingConfigRepository(database),
  });
  return cachedService;
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

  throw new BillingConfigError(
    "CLOUDBASE_DATABASE_UNAVAILABLE",
    "CloudBase database client is not configured for billing config APIs.",
    500,
  );
}

async function authenticateRequest(request) {
  const { CloudBaseAccessTokenVerifier, readBearerToken } = await import(
    "./infrastructure/cloudbase/auth/verify-access-token.mjs"
  );
  const token = readBearerToken(request.headers.authorization);
  if (!token) {
    throw new BillingConfigError("UNAUTHENTICATED", "A signed-in user is required.", 401);
  }

  const profile = await new CloudBaseAccessTokenVerifier().verify(token);
  if (!profile) {
    throw new BillingConfigError("UNAUTHENTICATED", "A signed-in user is required.", 401);
  }
  return profile;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new BillingConfigError("PAYLOAD_TOO_LARGE", "Request body is too large.", 413));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new BillingConfigError("INVALID_JSON", "Request body must be JSON."));
      }
    });
    request.on("error", reject);
  });
}

function requireAction(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BillingConfigError("INVALID_INPUT", "action is required.");
  }
  return value.trim();
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

module.exports = {
  getBillingConfigService,
  handleBillingConfig,
  nodeHandler,
};
