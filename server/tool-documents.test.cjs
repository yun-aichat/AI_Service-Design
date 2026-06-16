const assert = require("node:assert/strict");
const test = require("node:test");

test("getToolDocumentService wires the CloudBase repository", () => {
  const fakeDatabase = {
    collection(name) {
      return {
        name,
        doc() {
          return {
            async get() {
              return { data: null };
            },
            async set() {
              return {};
            },
          };
        },
        where() {
          return {
            async get() {
              return { data: [] };
            },
            async update() {
              return { updated: 0 };
            },
            limit() {
              return {
                async get() {
                  return { data: [] };
                },
              };
            },
          };
        },
      };
    },
  };

  const previous = globalThis.__cloudbaseDatabase;
  const modulePath = require.resolve("./tool-documents.cjs");
  delete require.cache[modulePath];
  globalThis.__cloudbaseDatabase = fakeDatabase;

  try {
    const { getToolDocumentService } = require("./tool-documents.cjs");
    const service = getToolDocumentService();
    assert.equal(typeof service.saveJourneyMap, "function");
  } finally {
    delete require.cache[modulePath];
    if (previous === undefined) {
      delete globalThis.__cloudbaseDatabase;
    } else {
      globalThis.__cloudbaseDatabase = previous;
    }
  }
});

test("getToolDocumentService fails with a CloudBase host error when no database is configured", () => {
  const previousDb = globalThis.__cloudbaseDatabase;
  const previousTcb = globalThis.tcb;
  const previousCloudbase = globalThis.cloudbase;
  const modulePath = require.resolve("./tool-documents.cjs");

  delete require.cache[modulePath];
  delete globalThis.__cloudbaseDatabase;
  delete globalThis.tcb;
  delete globalThis.cloudbase;

  try {
    const { getToolDocumentService } = require("./tool-documents.cjs");
    assert.throws(
      () => getToolDocumentService(),
      (error) => error?.code === "CLOUDBASE_DATABASE_UNAVAILABLE",
    );
  } finally {
    delete require.cache[modulePath];
    if (previousDb === undefined) {
      delete globalThis.__cloudbaseDatabase;
    } else {
      globalThis.__cloudbaseDatabase = previousDb;
    }
    if (previousTcb === undefined) {
      delete globalThis.tcb;
    } else {
      globalThis.tcb = previousTcb;
    }
    if (previousCloudbase === undefined) {
      delete globalThis.cloudbase;
    } else {
      globalThis.cloudbase = previousCloudbase;
    }
  }
});
