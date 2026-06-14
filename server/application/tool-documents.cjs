const COLLECTIONS = Object.freeze({
  projects: "projects",
  documents: "tool_documents",
  revisions: "tool_document_revisions",
  usageEvents: "tool_usage_events",
});

const USAGE_EVENT_TYPES = Object.freeze([
  "tool_saved",
  "proposal_applied",
  "ai_generated",
  "exported",
  "document_created",
]);

const REVISION_SOURCES = Object.freeze([
  "manual",
  "ai_proposal",
  "import",
  "migration",
  "system",
]);

const LARGE_TEXT_KEYS = new Set([
  "content",
  "currentJourney",
  "document",
  "image",
  "imageData",
  "journey",
  "proposal",
]);

class PersistenceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PersistenceError";
    this.code = code;
    this.status = status;
  }
}

class InMemoryToolDocumentRepository {
  constructor(seed = {}) {
    this.projects = new Map(
      Object.entries(seed.projects || {}).map(([id, value]) => [
        id,
        cloneJson(value),
      ]),
    );
    this.documents = new Map(
      Object.entries(seed.documents || {}).map(([id, value]) => [
        id,
        cloneJson(value),
      ]),
    );
    this.revisions = new Map(
      Object.entries(seed.revisions || {}).map(([id, value]) => [
        id,
        cloneJson(value),
      ]),
    );
    this.usageEvents = new Map(
      Object.entries(seed.usageEvents || {}).map(([id, value]) => [
        id,
        cloneJson(value),
      ]),
    );
    this.eventIdempotencyKeys = new Set(
      [...this.usageEvents.values()]
        .map((event) => event.idempotencyKey)
        .filter(Boolean),
    );
  }

  async getProject(projectId) {
    return cloneJson(this.projects.get(projectId) || null);
  }

  async listProjectsByOwner(ownerId) {
    return [...this.projects.values()]
      .filter((project) => project.ownerId === ownerId)
      .sort(sortByUpdatedAtDesc)
      .map((project) => cloneJson(project));
  }

  async createProject(record) {
    if (this.projects.has(record.id)) {
      throw new PersistenceError(
        "PROJECT_ALREADY_EXISTS",
        `Project "${record.id}" already exists.`,
        409,
      );
    }
    this.projects.set(record.id, cloneJson(record));
    return cloneJson(record);
  }

  async getDocument(documentId) {
    return cloneJson(this.documents.get(documentId) || null);
  }

  async findDocumentByProjectAndTool(projectId, toolId, ownerId) {
    const matches = [...this.documents.values()]
      .filter(
        (document) =>
          document.projectId === projectId &&
          document.toolId === toolId &&
          (!ownerId || document.ownerId === ownerId),
      )
      .sort(sortByUpdatedAtDesc);
    return cloneJson(matches[0] || null);
  }

  async createDocument(record) {
    if (this.documents.has(record.id)) {
      throw new PersistenceError(
        "DOCUMENT_ALREADY_EXISTS",
        `Document "${record.id}" already exists.`,
        409,
      );
    }
    this.documents.set(record.id, cloneJson(record));
    return cloneJson(record);
  }

  async updateDocumentIfRevision(documentId, expectedRevision, nextRecord) {
    const current = this.documents.get(documentId);
    if (!current || current.revision !== expectedRevision) return false;
    this.documents.set(documentId, cloneJson(nextRecord));
    return true;
  }

  async insertRevision(record) {
    if (this.revisions.has(record.id)) {
      throw new PersistenceError(
        "REVISION_ALREADY_EXISTS",
        `Revision "${record.id}" already exists.`,
        409,
      );
    }
    this.revisions.set(record.id, cloneJson(record));
    return cloneJson(record);
  }

  async insertUsageEvent(record) {
    if (
      record.idempotencyKey &&
      this.eventIdempotencyKeys.has(record.idempotencyKey)
    ) {
      return null;
    }
    this.usageEvents.set(record.id, cloneJson(record));
    if (record.idempotencyKey) this.eventIdempotencyKeys.add(record.idempotencyKey);
    return cloneJson(record);
  }
}

function createToolDocumentService({
  repository,
  now = () => new Date().toISOString(),
  createId = defaultCreateId,
  validateContent = (content) => content,
} = {}) {
  if (!repository) {
    throw new PersistenceError(
      "REPOSITORY_REQUIRED",
      "Tool document service requires a repository.",
    );
  }

  async function listProjects(input) {
    const userId = requireUserId(input?.user);
    return listProjectsForUser(userId);
  }

  async function getJourneyMapContext(input) {
    const userId = requireUserId(input?.user);
    const requestedProjectId = normalizeOptionalString(input?.projectId);
    const requestedDocumentId = normalizeOptionalString(input?.documentId);

    let project = null;
    let document = null;

    if (requestedDocumentId) {
      document = await repository.getDocument(requestedDocumentId);
      if (!document) {
        throw new PersistenceError("DOCUMENT_NOT_FOUND", "Document not found.", 404);
      }
      assertOwner(document, userId);
      if (document.toolId !== "journey-map") {
        throw new PersistenceError(
          "DOCUMENT_TOOL_MISMATCH",
          "Document belongs to a different tool.",
          409,
        );
      }
      project = await loadProjectForUser(document.projectId, userId);
      if (requestedProjectId && requestedProjectId !== project.id) {
        throw new PersistenceError(
          "DOCUMENT_PROJECT_MISMATCH",
          "Document belongs to a different project.",
          409,
        );
      }
    } else {
      project = await resolveProjectForUser(userId, requestedProjectId);
      document = await repository.findDocumentByProjectAndTool(
        project.id,
        "journey-map",
        userId,
      );
    }

    const projects = await listProjectsForUser(userId);
    return {
      project,
      projects,
      document,
      suggestedDocumentId: defaultJourneyMapDocumentId(project.id),
    };
  }

  async function readDocument(input) {
    const documentId = requireString(input?.documentId, "documentId");
    const userId = requireUserId(input?.user);
    const document = await repository.getDocument(documentId);
    if (!document) {
      throw new PersistenceError("DOCUMENT_NOT_FOUND", "Document not found.", 404);
    }
    assertOwner(document, userId);
    return document;
  }

  async function saveJourneyMap(input) {
    return saveDocument({
      ...input,
      toolId: "journey-map",
      eventMetadata: {
        ...(input?.eventMetadata || {}),
        tool: "journey-map",
      },
    });
  }

  async function applyJourneyMapProposal(input) {
    return saveDocument({
      ...input,
      toolId: "journey-map",
      source: "ai_proposal",
      eventTypes: ["tool_saved", "proposal_applied"],
      eventMetadata: {
        ...(input?.eventMetadata || {}),
        commandId: input?.commandId || null,
        summaryCount: Array.isArray(input?.summary) ? input.summary.length : null,
        tool: "journey-map",
      },
    });
  }

  async function saveDocument(input) {
    const savedAt = now();
    const userId = requireUserId(input?.user);
    const documentId = requireString(input?.documentId, "documentId");
    const projectId = requireString(input?.projectId, "projectId");
    const toolId = requireString(input?.toolId, "toolId");
    const title = requireString(input?.title, "title");
    const schemaVersion = requirePositiveInteger(
      input?.schemaVersion,
      "schemaVersion",
    );
    const source = normalizeRevisionSource(input?.source);
    const expectedRevision =
      typeof input?.expectedRevision === "number"
        ? input.expectedRevision
        : input?.expectedRevision === null || input?.expectedRevision === undefined
          ? null
          : Number.NaN;

    if (expectedRevision !== null && !Number.isInteger(expectedRevision)) {
      throw new PersistenceError(
        "INVALID_EXPECTED_REVISION",
        "expectedRevision must be an integer or null for first save.",
      );
    }

    const content = validateContent(toolId, input?.content);
    assertJsonSerializable(content, "content");

    const existing = await repository.getDocument(documentId);
    const isCreate = !existing;
    if (existing) {
      assertOwner(existing, userId);
      if (existing.toolId !== toolId) {
        throw new PersistenceError(
          "DOCUMENT_TOOL_MISMATCH",
          "Document belongs to a different tool.",
          409,
        );
      }
      if (existing.projectId !== projectId) {
        throw new PersistenceError(
          "DOCUMENT_PROJECT_MISMATCH",
          "Document belongs to a different project.",
          409,
        );
      }
      if (expectedRevision !== existing.revision) {
        throw revisionConflict(existing.revision, expectedRevision);
      }
    } else if (expectedRevision !== null && expectedRevision !== 0) {
      throw revisionConflict(0, expectedRevision);
    }

    const revision = existing ? existing.revision + 1 : 0;
    const document = {
      id: documentId,
      projectId,
      ownerId: userId,
      toolId,
      title,
      schemaVersion,
      revision,
      content,
      createdAt: existing?.createdAt || savedAt,
      updatedAt: savedAt,
    };

    if (existing) {
      const updated = await repository.updateDocumentIfRevision(
        documentId,
        existing.revision,
        document,
      );
      if (!updated) throw revisionConflict(existing.revision, expectedRevision);
    } else {
      await repository.createDocument(document);
    }

    const revisionRecord = {
      id: `${documentId}:rev:${revision}`,
      documentId,
      projectId,
      ownerId: userId,
      toolId,
      revision,
      source,
      actorId: input?.actorId || userId || null,
      commandId: input?.commandId || null,
      content,
      summary: typeof input?.summary === "string" ? input.summary : null,
      createdAt: savedAt,
    };
    await repository.insertRevision(revisionRecord);

    const eventTypes = [
      ...(isCreate ? ["document_created"] : []),
      ...(Array.isArray(input?.eventTypes) && input.eventTypes.length
        ? input.eventTypes
        : ["tool_saved"]),
    ];
    const events = [];
    for (const eventType of eventTypes) {
      events.push(
        await recordUsageEvent({
          user: input.user,
          projectId,
          documentId,
          toolId,
          eventType,
          revision,
          sessionId: input?.sessionId || null,
          idempotencyKey: eventIdempotencyKey(input?.idempotencyKey, eventType),
          metadata: {
            ...(input?.eventMetadata || {}),
            source,
          },
          createdAt: savedAt,
        }),
      );
    }

    return {
      document,
      revision: revisionRecord,
      events: events.filter(Boolean),
    };
  }

  async function recordExportSucceeded(input) {
    return recordUsageEvent({
      ...input,
      eventType: "exported",
    });
  }

  async function recordUsageEvent(input) {
    const createdAt = input?.createdAt || now();
    const userId = requireUserId(input?.user);
    const toolId = requireString(input?.toolId, "toolId");
    const eventType = requireString(input?.eventType, "eventType");
    if (!USAGE_EVENT_TYPES.includes(eventType)) {
      throw new PersistenceError(
        "INVALID_USAGE_EVENT",
        `Unsupported usage event "${eventType}".`,
      );
    }

    const event = {
      id: createId("usage"),
      userId,
      projectId: input?.projectId || null,
      documentId: input?.documentId || null,
      toolId,
      eventType,
      eventSource: input?.eventSource || "server",
      revision:
        typeof input?.revision === "number" && Number.isInteger(input.revision)
          ? input.revision
          : null,
      exportFormat: input?.exportFormat || null,
      sessionId: input?.sessionId || null,
      idempotencyKey: input?.idempotencyKey || null,
      metadata: sanitizeEventMetadata(input?.metadata || null),
      createdAt,
    };

    return repository.insertUsageEvent(event);
  }

  async function listProjectsForUser(userId) {
    const projects = await repository.listProjectsByOwner(userId);
    return Array.isArray(projects) ? projects : [];
  }

  async function resolveProjectForUser(userId, requestedProjectId) {
    if (requestedProjectId) {
      return loadProjectForUser(requestedProjectId, userId);
    }

    const existingProjects = await listProjectsForUser(userId);
    if (existingProjects.length) {
      return existingProjects[0];
    }

    const createdAt = now();
    return repository.createProject({
      id: createId("project"),
      ownerId: userId,
      name: "默认项目",
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function loadProjectForUser(projectId, userId) {
    const project = await repository.getProject(projectId);
    if (!project) {
      throw new PersistenceError("PROJECT_NOT_FOUND", "Project not found.", 404);
    }
    assertProjectOwner(project, userId);
    return project;
  }

  return {
    listProjects,
    getJourneyMapContext,
    readDocument,
    saveDocument,
    saveJourneyMap,
    applyJourneyMapProposal,
    recordExportSucceeded,
    recordUsageEvent,
  };
}

function sanitizeEventMetadata(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 4) return "[Truncated]";
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeEventMetadata(item, depth + 1));
  }
  if (typeof value !== "object") return null;

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (LARGE_TEXT_KEYS.has(key)) {
      result[key] = "[Omitted]";
    } else {
      result[key] = sanitizeEventMetadata(entry, depth + 1);
    }
  }
  return result;
}

function assertJsonSerializable(value, path) {
  if (value === null) return;
  if (["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number") {
    if (Number.isFinite(value) && !Object.is(value, -0)) return;
    throw new PersistenceError("NON_SERIALIZABLE_CONTENT", `${path} is not JSON serializable.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSerializable(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertJsonSerializable(entry, `${path}.${key}`);
    }
    return;
  }
  throw new PersistenceError("NON_SERIALIZABLE_CONTENT", `${path} is not JSON serializable.`);
}

function assertOwner(document, userId) {
  if (document.ownerId !== userId) {
    throw new PersistenceError("FORBIDDEN", "Document belongs to another user.", 403);
  }
}

function assertProjectOwner(project, userId) {
  if (project.ownerId !== userId) {
    throw new PersistenceError("FORBIDDEN", "Project belongs to another user.", 403);
  }
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function defaultCreateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function eventIdempotencyKey(baseKey, eventType) {
  if (!baseKey) return null;
  return `${baseKey}:${eventType}`;
}

function defaultJourneyMapDocumentId(projectId) {
  return `${projectId}:journey-map`;
}

function normalizeRevisionSource(source) {
  if (REVISION_SOURCES.includes(source)) return source;
  return "manual";
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new PersistenceError("INVALID_INPUT", `${field} must be a positive integer.`);
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PersistenceError("INVALID_INPUT", `${field} is required.`);
  }
  return value.trim();
}

function requireUserId(user) {
  const id = typeof user?.id === "string" ? user.id.trim() : "";
  if (!id) throw new PersistenceError("UNAUTHENTICATED", "A signed-in user is required.", 401);
  return id;
}

function revisionConflict(actualRevision, expectedRevision) {
  return new PersistenceError(
    "REVISION_CONFLICT",
    `Expected revision ${expectedRevision}, current revision is ${actualRevision}.`,
    409,
  );
}

function sortByUpdatedAtDesc(left, right) {
  return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
}

module.exports = {
  COLLECTIONS,
  InMemoryToolDocumentRepository,
  PersistenceError,
  REVISION_SOURCES,
  USAGE_EVENT_TYPES,
  createToolDocumentService,
  sanitizeEventMetadata,
};
