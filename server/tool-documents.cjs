const {
  PersistenceError,
  createToolDocumentService,
} = require("./application/tool-documents.cjs");
const {
  CloudBaseToolDocumentRepository,
} = require("./infrastructure/cloudbase/tool-documents/repository.cjs");

let cachedService = null;

async function handleToolDocuments(request) {
  const user = await authenticateRequest(request);
  const body = await readJsonBody(request);
  const action = body?.action;
  const service = getToolDocumentService();

  switch (action) {
    case "listProjects":
      return service.listProjects({
        user,
      });
    case "getJourneyMapContext":
      return service.getJourneyMapContext({
        user,
        projectId: body.projectId,
        documentId: body.documentId,
      });
    case "readDocument":
      return service.readDocument({
        user,
        documentId: body.documentId,
      });
    case "saveJourneyMap":
      return service.saveJourneyMap({
        ...body,
        user,
      });
    case "applyJourneyMapProposal":
      return service.applyJourneyMapProposal({
        ...body,
        user,
      });
    case "recordExportSucceeded":
      return service.recordExportSucceeded({
        ...body,
        user,
        eventSource: "web",
      });
    default:
      throw new PersistenceError(
        "UNKNOWN_ACTION",
        `Unsupported tool document action "${action}".`,
        404,
      );
  }
}

function getToolDocumentService() {
  if (cachedService) return cachedService;

  const database = resolveCloudBaseDatabase();
  cachedService = createToolDocumentService({
    repository: new CloudBaseToolDocumentRepository(database),
    validateContent(toolId, content) {
      if (toolId !== "journey-map") return content;
      if (typeof content !== "object" || content === null) {
        throw new PersistenceError(
          "INVALID_JOURNEY_MAP",
          "Journey Map content must be an object.",
        );
      }
      return content;
    },
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

  throw new PersistenceError(
    "CLOUDBASE_DATABASE_UNAVAILABLE",
    "CloudBase database client is not configured for tool document APIs.",
    500,
  );
}

async function authenticateRequest(request) {
  const { CloudBaseAccessTokenVerifier, readBearerToken } = await import(
    "./infrastructure/cloudbase/auth/verify-access-token.mjs"
  );
  const token = readBearerToken(request.headers.authorization);
  if (!token && process.env.PERSISTENCE_ALLOW_ANONYMOUS === "1") {
    return { id: "anonymous-demo" };
  }

  const profile = await new CloudBaseAccessTokenVerifier().verify(token);
  if (!profile) {
    throw new PersistenceError("UNAUTHENTICATED", "A signed-in user is required.", 401);
  }
  return profile;
}

function nodeHandler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Only POST is supported." });
    return;
  }

  handleToolDocuments(request)
    .then((result) => sendJson(response, 200, result))
    .catch((error) => {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      sendJson(response, status, {
        error: error instanceof Error ? error.message : "Persistence request failed.",
        code: error?.code || "PERSISTENCE_ERROR",
      });
    });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new PersistenceError("PAYLOAD_TOO_LARGE", "Request body is too large.", 413));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new PersistenceError("INVALID_JSON", "Request body must be JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

module.exports = {
  getToolDocumentService,
  handleToolDocuments,
  nodeHandler,
  resolveCloudBaseDatabase,
};
