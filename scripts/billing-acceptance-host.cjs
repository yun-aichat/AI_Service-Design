const http = require("node:http");
const { createServer: createViteServer } = require("vite");
const {
  BillingPortalError,
  createBillingPortalService,
  normalizePortalError,
} = require("../server/application/billing-portal.cjs");
const {
  InMemoryBillingRepository,
  createBillingService,
} = require("../server/application/billing/index.cjs");

const HOST = process.env.BILLING_ACCEPTANCE_HOST || "127.0.0.1";
const PORT = Number(process.env.BILLING_ACCEPTANCE_PORT || 4173);
const seededPortals = new Map();

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function start() {
  const vite = await createViteServer({
    appType: "spa",
    server: {
      host: HOST,
      middlewareMode: true,
    },
  });

  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === "/api/billing") {
        await handleBillingApi(request, response);
        return;
      }
      vite.middlewares(request, response);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Acceptance host failed.",
        code: "ACCEPTANCE_HOST_ERROR",
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });

  const stop = async () => {
    await vite.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(
    `Billing acceptance host running at http://${HOST}:${PORT}/billing`,
  );
}

async function handleBillingApi(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, {
      error: "Only POST is supported.",
      code: "METHOD_NOT_ALLOWED",
    });
    return;
  }

  try {
    const user = await authenticateRequest(request);
    const body = await readJsonBody(request);
    const action = requireAction(body?.action);
    const portal = await getSeededPortal(user);

    let result;
    switch (action) {
      case "getMyCreditAccount":
        result = await portal.getMyCreditAccount({ user });
        break;
      case "listCreditPackages":
        result = await portal.listCreditPackages({
          user,
          enabled: body.enabled,
          limit: body.limit,
          offset: body.offset,
        });
        break;
      case "listMyLedgerEntries":
        result = await portal.listMyLedgerEntries({
          user,
          operation: body.operation,
          referenceType: body.referenceType,
          limit: body.limit,
          offset: body.offset,
        });
        break;
      default:
        throw new BillingPortalError(
          "UNKNOWN_ACTION",
          `Unsupported billing action "${action}".`,
          404,
        );
    }

    sendJson(response, 200, result);
  } catch (error) {
    const normalized = normalizePortalError(error);
    sendJson(
      response,
      Number.isInteger(normalized?.status) ? normalized.status : 500,
      {
        error:
          normalized instanceof Error
            ? normalized.message
            : "Billing request failed.",
        code: normalized?.code || "BILLING_PORTAL_ERROR",
      },
    );
  }
}

async function getSeededPortal(user) {
  const existing = seededPortals.get(user.id);
  if (existing) return existing;

  const repository = new InMemoryBillingRepository({
    ledgerEntries: Object.fromEntries(
      buildLedgerEntriesForUser(user.id).map((entry) => [entry.id, entry]),
    ),
  });
  const billingService = createBillingService({
    repository,
    now: () => "2026-06-16T20:00:00.000Z",
    createId: createSequentialIdFactory(),
  });
  await seedPackages(billingService);

  const portal = createBillingPortalService({
    billingRepository: repository,
    billingService,
  });
  seededPortals.set(user.id, portal);
  return portal;
}

async function seedPackages(billingService) {
  const packages = [
    {
      packageId: "starter-100",
      displayName: "Starter 100",
      credits: 100,
      bonusCredits: 0,
      priceValue: 990,
      currency: "CNY",
      enabled: true,
      sortOrder: 10,
      description: "适合首次体验积分功能。",
    },
    {
      packageId: "pro-500",
      displayName: "Pro 500",
      credits: 500,
      bonusCredits: 50,
      priceValue: 3990,
      currency: "CNY",
      enabled: true,
      sortOrder: 20,
      description: "恢复后的用户侧套餐列表验收用数据。",
    },
    {
      packageId: "archived-1000",
      displayName: "Archived 1000",
      credits: 1000,
      bonusCredits: 100,
      priceValue: 7990,
      currency: "CNY",
      enabled: false,
      sortOrder: 30,
      description: "已下架套餐不会出现在默认列表。",
    },
  ];

  for (const item of packages) {
    try {
      await billingService.createCreditPackage(item);
    } catch (error) {
      if (error?.code !== "CREDIT_PACKAGE_ALREADY_EXISTS") throw error;
    }
  }
}

function buildLedgerEntriesForUser(accountId) {
  const primaryEntries = [
    makeLedgerEntry({
      id: "ledger-001",
      accountId,
      operation: "purchase",
      referenceType: "order",
      referenceId: "order:starter-1",
      credits: 120,
      availableDelta: 120,
      createdAt: "2026-06-16T09:00:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-002",
      accountId,
      operation: "grant",
      referenceType: "admin",
      referenceId: "admin:welcome",
      credits: 30,
      availableDelta: 30,
      createdAt: "2026-06-16T09:10:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-003",
      accountId,
      operation: "reserve",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-1",
      credits: 12,
      availableDelta: -12,
      reservedDelta: 12,
      createdAt: "2026-06-16T09:20:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-004",
      accountId,
      operation: "commit",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-1",
      credits: 12,
      reservedDelta: -12,
      consumedDelta: 12,
      createdAt: "2026-06-16T09:30:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-005",
      accountId,
      operation: "purchase",
      referenceType: "order",
      referenceId: "order:pro-1",
      credits: 200,
      availableDelta: 200,
      createdAt: "2026-06-16T09:40:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-006",
      accountId,
      operation: "reserve",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-2",
      credits: 20,
      availableDelta: -20,
      reservedDelta: 20,
      createdAt: "2026-06-16T09:50:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-007",
      accountId,
      operation: "release",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-2",
      credits: 20,
      availableDelta: 20,
      reservedDelta: -20,
      createdAt: "2026-06-16T10:00:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-008",
      accountId,
      operation: "adjustment",
      referenceType: "admin",
      referenceId: "admin:reconcile",
      credits: 8,
      availableDelta: 8,
      createdAt: "2026-06-16T10:10:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-009",
      accountId,
      operation: "expire",
      referenceType: "admin",
      referenceId: "admin:expiry",
      credits: 5,
      availableDelta: -5,
      createdAt: "2026-06-16T10:20:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-010",
      accountId,
      operation: "purchase",
      referenceType: "order",
      referenceId: "order:topup-3",
      credits: 60,
      availableDelta: 60,
      createdAt: "2026-06-16T10:30:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-011",
      accountId,
      operation: "commit",
      referenceType: "ai_run",
      referenceId: "ai_run:journey-3",
      credits: 18,
      consumedDelta: 18,
      createdAt: "2026-06-16T10:40:00.000Z",
    }),
    makeLedgerEntry({
      id: "ledger-012",
      accountId,
      operation: "refund",
      referenceType: "refund",
      referenceId: "refund:order-7",
      credits: 15,
      availableDelta: 15,
      createdAt: "2026-06-16T10:50:00.000Z",
    }),
  ];

  const otherAccountEntries = [
    makeLedgerEntry({
      id: "other-001",
      accountId: `other-${accountId}`,
      operation: "purchase",
      referenceType: "order",
      referenceId: "order:other-1",
      credits: 999,
      availableDelta: 999,
      createdAt: "2026-06-16T10:55:00.000Z",
    }),
  ];

  return [...primaryEntries, ...otherAccountEntries];
}

function makeLedgerEntry(overrides) {
  return {
    id: overrides.id,
    accountId: overrides.accountId,
    orderId:
      overrides.referenceType === "order"
        ? overrides.referenceId.split(":")[1]
        : null,
    reservationId:
      overrides.referenceType === "ai_run"
        ? overrides.referenceId.split(":")[1]
        : null,
    referenceType: overrides.referenceType,
    referenceId: overrides.referenceId,
    idempotencyKey: `${overrides.operation}:${overrides.referenceId}:${overrides.id}`,
    operation: overrides.operation,
    credits: overrides.credits,
    availableDelta: overrides.availableDelta || 0,
    reservedDelta: overrides.reservedDelta || 0,
    consumedDelta: overrides.consumedDelta || 0,
    metadata: null,
    createdAt: overrides.createdAt,
  };
}

function createSequentialIdFactory() {
  let sequence = 0;
  return (prefix) => `${prefix}-${String(++sequence).padStart(4, "0")}`;
}

async function authenticateRequest(request) {
  const { CloudBaseAccessTokenVerifier, readBearerToken } = await import(
    "../server/infrastructure/cloudbase/auth/verify-access-token.mjs"
  );
  const token = readBearerToken(request.headers.authorization);
  if (!token) {
    throw new BillingPortalError(
      "UNAUTHENTICATED",
      "A signed-in user is required.",
      401,
    );
  }

  let profile = null;
  try {
    profile = await new CloudBaseAccessTokenVerifier().verify(token);
  } catch {
    profile = null;
  }
  if (
    profile?.id &&
    profile.id !== "undefined" &&
    profile.id !== "null"
  ) {
    return profile;
  }

  const decoded = decodeJwtPayload(token);
  const fallbackId = decoded?.user_id || decoded?.sub;
  if (!fallbackId) {
    throw new BillingPortalError(
      "UNAUTHENTICATED",
      "A signed-in user is required.",
      401,
    );
  }
  return {
    id: String(fallbackId),
    email: typeof decoded?.email === "string" ? decoded.email : null,
    phone: typeof decoded?.phone_number === "string" ? decoded.phone_number : null,
    displayName: typeof decoded?.name === "string" ? decoded.name : null,
    roles: [],
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(
          new BillingPortalError(
            "PAYLOAD_TOO_LARGE",
            "Request body is too large.",
            413,
          ),
        );
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(
          new BillingPortalError("INVALID_JSON", "Request body must be JSON.", 400),
        );
      }
    });
    request.on("error", reject);
  });
}

function requireAction(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BillingPortalError("INVALID_INPUT", "action is required.", 400);
  }
  return value.trim();
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function decodeJwtPayload(token) {
  try {
    const segments = String(token || "").split(".");
    if (segments.length < 2) return null;
    const payload = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized = payload.padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "=",
    );
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
