const {
  createGlmAssistantModelProvider,
} = require("./application/assistant/glm-provider.cjs");
const {
  AssistantProtocolError,
} = require("./application/assistant/protocol.cjs");
const { createAssistantService } = require("./application/assistant/service.cjs");
const {
  createAssistantBillingService,
  createBillingService,
} = require("./application/billing/index.cjs");
const {
  createToolDocumentAssistantUsageRecorder,
} = require("./application/assistant/usage-recorder.cjs");
const { getBillingConfigService } = require("./billing-config.cjs");
const {
  CloudBaseBillingRepository,
} = require("./infrastructure/cloudbase/billing/repository.cjs");
const { getToolDocumentService } = require("./tool-documents.cjs");

let assistantService = null;

async function handleJourneyChat(payload, options = {}) {
  try {
    return await getAssistantService().handleRequest(payload, options);
  } catch (error) {
    if (error instanceof AssistantProtocolError) {
      error.statusCode = error.status;
    }
    throw error;
  }
}

function getAssistantService(overrides = {}) {
  if (!assistantService) {
    const resolvedModelProvider =
      overrides.modelProvider || createGlmAssistantModelProvider();
    const resolvedToolDocumentService =
      overrides.toolDocumentService || getToolDocumentService();
    const resolvedBillingConfigService =
      overrides.billingConfigService || getBillingConfigService();

    assistantService = createAssistantService({
      billingSettlement: createAssistantBillingService({
        billingService: overrides.billingService || getBillingService(),
        billingConfigService: resolvedBillingConfigService,
      }),
      modelProvider: resolvedModelProvider,
      usageRecorder: createToolDocumentAssistantUsageRecorder({
        toolDocumentService: resolvedToolDocumentService,
        billingConfigService: resolvedBillingConfigService,
      }),
    });
  }
  return assistantService;
}

let billingService = null;

function getBillingService() {
  if (!billingService) {
    const database = resolveCloudBaseDatabase();
    billingService = createBillingService({
      repository: new CloudBaseBillingRepository(database),
    });
  }
  return billingService;
}

function resetAssistantServiceForTests() {
  assistantService = null;
  billingService = null;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function nodeHandler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const user = await authenticateRequest(req).catch(() => null);
    const result = await handleJourneyChat(await readJsonBody(req), { user });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = error.statusCode || 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message || "AI 服务请求失败" }));
  }
}

async function authenticateRequest(request) {
  const { CloudBaseAccessTokenVerifier, readBearerToken } = await import(
    "./infrastructure/cloudbase/auth/verify-access-token.mjs"
  );
  const token = readBearerToken(request.headers.authorization);
  if (!token && process.env.PERSISTENCE_ALLOW_ANONYMOUS === "1") {
    return { id: "anonymous-demo" };
  }
  if (!token) return null;
  return new CloudBaseAccessTokenVerifier().verify(token);
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

  throw new Error("CloudBase database client is not configured for assistant billing.");
}

module.exports = {
  getBillingService,
  getAssistantService,
  handleJourneyChat,
  nodeHandler,
  resetAssistantServiceForTests,
};
