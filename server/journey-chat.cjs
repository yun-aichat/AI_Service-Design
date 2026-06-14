const {
  createGlmAssistantModelProvider,
} = require("./application/assistant/glm-provider.cjs");
const {
  AssistantProtocolError,
} = require("./application/assistant/protocol.cjs");
const { createAssistantService } = require("./application/assistant/service.cjs");
const {
  createToolDocumentAssistantUsageRecorder,
} = require("./application/assistant/usage-recorder.cjs");
const { service: toolDocumentService } = require("./tool-documents.cjs");

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

function getAssistantService() {
  if (!assistantService) {
    assistantService = createAssistantService({
      modelProvider: createGlmAssistantModelProvider(),
      usageRecorder: createToolDocumentAssistantUsageRecorder({
        toolDocumentService,
      }),
    });
  }
  return assistantService;
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

module.exports = { handleJourneyChat, nodeHandler };
