const assert = require("node:assert/strict");
const test = require("node:test");

const { CloudBaseToolDocumentRepository } = require("./repository.cjs");

test("createProject rejects duplicates instead of overwriting existing records", async () => {
  const { repository, stores } = createRepository();
  const original = {
    id: "project-1",
    ownerId: "user-1",
    name: "原项目",
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z",
  };

  await repository.createProject(original);

  await assert.rejects(
    () =>
      repository.createProject({
        ...original,
        name: "覆盖版本",
      }),
    (error) => error?.code === "PROJECT_ALREADY_EXISTS",
  );

  assert.equal(stores.projects.get("project-1").name, "原项目");
});

test("createDocument rejects duplicates instead of overwriting existing records", async () => {
  const { repository, stores } = createRepository();
  const original = {
    id: "doc-1",
    projectId: "project-1",
    ownerId: "user-1",
    toolId: "journey-map",
    schemaVersion: 1,
    revision: 0,
    title: "初始文档",
    content: { title: "初始文档" },
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z",
  };

  await repository.createDocument(original);

  await assert.rejects(
    () =>
      repository.createDocument({
        ...original,
        title: "覆盖文档",
      }),
    (error) => error?.code === "DOCUMENT_ALREADY_EXISTS",
  );

  assert.equal(stores.documents.get("doc-1").title, "初始文档");
});

test("insertRevision rejects duplicates instead of overwriting existing snapshots", async () => {
  const { repository, stores } = createRepository();
  const original = {
    id: "doc-1:rev:0",
    documentId: "doc-1",
    projectId: "project-1",
    ownerId: "user-1",
    toolId: "journey-map",
    revision: 0,
    source: "system",
    actorId: "user-1",
    commandId: null,
    content: { title: "初始文档" },
    summary: null,
    createdAt: "2026-06-07T00:00:00.000Z",
  };

  await repository.insertRevision(original);

  await assert.rejects(
    () =>
      repository.insertRevision({
        ...original,
        summary: "覆盖快照",
      }),
    (error) => error?.code === "REVISION_ALREADY_EXISTS",
  );

  assert.equal(stores.revisions.get("doc-1:rev:0").summary, null);
});

function createRepository() {
  const database = createFakeDatabase();
  return {
    repository: new CloudBaseToolDocumentRepository(database),
    stores: database.stores,
  };
}

function createFakeDatabase() {
  const stores = {
    projects: new Map(),
    tool_documents: new Map(),
    tool_document_revisions: new Map(),
    tool_usage_events: new Map(),
  };

  return {
    stores: {
      projects: stores.projects,
      documents: stores.tool_documents,
      revisions: stores.tool_document_revisions,
      usageEvents: stores.tool_usage_events,
    },
    collection(name) {
      const store = stores[name];
      if (!store) {
        throw new Error(`Unknown collection "${name}".`);
      }
      return createFakeCollection(store);
    },
  };
}

function createFakeCollection(store) {
  return {
    doc(id) {
      return {
        async get() {
          return { data: store.has(id) ? cloneJson(store.get(id)) : null };
        },
        async set(record) {
          store.set(id, cloneJson(record));
          return { id };
        },
      };
    },
    where(query) {
      const matchedEntries = () =>
        [...store.values()].filter((entry) =>
          Object.entries(query).every(([key, value]) => entry?.[key] === value),
        );

      return {
        async get() {
          return { data: matchedEntries().map((entry) => cloneJson(entry)) };
        },
        async update(nextRecord) {
          let updated = 0;
          for (const entry of matchedEntries()) {
            store.set(entry.id, cloneJson(nextRecord));
            updated += 1;
          }
          return { updated };
        },
        limit(count) {
          return {
            async get() {
              return {
                data: matchedEntries()
                  .slice(0, count)
                  .map((entry) => cloneJson(entry)),
              };
            },
          };
        },
      };
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
