const {
  COLLECTIONS,
  PersistenceError,
} = require("../../../application/tool-documents.cjs");

class CloudBaseToolDocumentRepository {
  constructor(database) {
    if (!database || typeof database.collection !== "function") {
      throw new Error("CloudBaseToolDocumentRepository requires a database client.");
    }
    this.database = database;
    this.projects = database.collection(COLLECTIONS.projects);
    this.documents = database.collection(COLLECTIONS.documents);
    this.revisions = database.collection(COLLECTIONS.revisions);
    this.usageEvents = database.collection(COLLECTIONS.usageEvents);
  }

  async getProject(projectId) {
    const result = await this.projects.doc(projectId).get();
    return firstRecord(result);
  }

  async listProjectsByOwner(ownerId) {
    const result = await this.projects.where({ ownerId }).get();
    return sortByUpdatedAtDesc(Array.isArray(result?.data) ? result.data : []);
  }

  async createProject(record) {
    const existing = await this.getProject(record.id);
    if (existing) {
      throw new PersistenceError(
        "PROJECT_ALREADY_EXISTS",
        `Project "${record.id}" already exists.`,
        409,
      );
    }
    await this.projects.doc(record.id).set(record);
    return record;
  }

  async getDocument(documentId) {
    const result = await this.documents.doc(documentId).get();
    return firstRecord(result);
  }

  async findDocumentByProjectAndTool(projectId, toolId, ownerId) {
    const query = { projectId, toolId, ...(ownerId ? { ownerId } : {}) };
    const result = await this.documents.where(query).get();
    return sortByUpdatedAtDesc(Array.isArray(result?.data) ? result.data : [])[0] || null;
  }

  async createDocument(record) {
    const existing = await this.getDocument(record.id);
    if (existing) {
      throw new PersistenceError(
        "DOCUMENT_ALREADY_EXISTS",
        `Document "${record.id}" already exists.`,
        409,
      );
    }
    await this.documents.doc(record.id).set(record);
    return record;
  }

  async updateDocumentIfRevision(documentId, expectedRevision, nextRecord) {
    const result = await this.documents
      .where({ id: documentId, revision: expectedRevision })
      .update(nextRecord);
    return updateCount(result) === 1;
  }

  async insertRevision(record) {
    const existing = await this.revisions.doc(record.id).get();
    if (firstRecord(existing)) {
      throw new PersistenceError(
        "REVISION_ALREADY_EXISTS",
        `Revision "${record.id}" already exists.`,
        409,
      );
    }
    await this.revisions.doc(record.id).set(record);
    return record;
  }

  async insertUsageEvent(record) {
    if (record.idempotencyKey) {
      const duplicate = await this.usageEvents
        .where({ idempotencyKey: record.idempotencyKey })
        .limit(1)
        .get();
      if (firstRecord(duplicate)) return null;
    }
    await this.usageEvents.doc(record.id).set(record);
    return record;
  }
}

function firstRecord(result) {
  if (!result) return null;
  if (Array.isArray(result.data)) return result.data[0] || null;
  if (result.data && typeof result.data === "object") return result.data;
  return null;
}

function updateCount(result) {
  return Number(result?.updated ?? result?.modified ?? result?.stats?.updated ?? 0);
}

function sortByUpdatedAtDesc(records) {
  return [...records].sort((left, right) =>
    String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || "")),
  );
}

module.exports = {
  CloudBaseToolDocumentRepository,
  COLLECTIONS,
};
