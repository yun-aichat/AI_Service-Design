const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createAcceptanceDatabase,
  routeAcceptanceApiRequest,
} = require("../scripts/acceptance-host-support.cjs");

test("acceptance host routes billing and tool-document apis before falling through", async () => {
  const calls = [];
  const handledBilling = await routeAcceptanceApiRequest({
    request: { url: "/api/billing", headers: { authorization: "Bearer token" } },
    response: {},
    viteMiddlewares: () => calls.push("vite"),
    billingApiHandler: () => calls.push("billing"),
    billingConfigApiHandler: () => calls.push("billing-config"),
    toolDocumentsApiHandler: () => calls.push("tool-documents"),
    journeyChatApiHandler: () => calls.push("journey-chat"),
    ensureAcceptanceLedgerSeed: () => calls.push("seed"),
  });

  assert.equal(handledBilling, true);
  assert.deepEqual(calls, ["seed", "billing"]);

  calls.length = 0;
  const handledToolDocuments = await routeAcceptanceApiRequest({
    request: { url: "/api/tool-documents", headers: {} },
    response: {},
    viteMiddlewares: () => calls.push("vite"),
    billingApiHandler: () => calls.push("billing"),
    billingConfigApiHandler: () => calls.push("billing-config"),
    toolDocumentsApiHandler: () => calls.push("tool-documents"),
    journeyChatApiHandler: () => calls.push("journey-chat"),
    ensureAcceptanceLedgerSeed: () => calls.push("seed"),
  });

  assert.equal(handledToolDocuments, true);
  assert.deepEqual(calls, ["tool-documents"]);

  calls.length = 0;
  const handledBillingConfig = await routeAcceptanceApiRequest({
    request: { url: "/api/billing-config", headers: {} },
    response: {},
    viteMiddlewares: () => calls.push("vite"),
    billingApiHandler: () => calls.push("billing"),
    billingConfigApiHandler: () => calls.push("billing-config"),
    toolDocumentsApiHandler: () => calls.push("tool-documents"),
    journeyChatApiHandler: () => calls.push("journey-chat"),
    ensureAcceptanceLedgerSeed: () => calls.push("seed"),
  });

  assert.equal(handledBillingConfig, true);
  assert.deepEqual(calls, ["billing-config"]);
});

test("acceptance host database exposes billing and tool-document collections", async () => {
  const database = createAcceptanceDatabase();

  await database.collection("projects").doc("project-1").set({
    id: "project-1",
    ownerId: "user-1",
    name: "默认项目",
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
  });
  await database.collection("credit_packages").doc("pkg-1").set({
    packageId: "pkg-1",
    displayName: "Starter",
  });

  const project = await database.collection("projects").doc("project-1").get();
  const creditPackage = await database.collection("credit_packages").doc("pkg-1").get();
  const packageCount = await database.collection("credit_packages").count();

  assert.equal(project.data.id, "project-1");
  assert.equal(creditPackage.data.packageId, "pkg-1");
  assert.equal(packageCount.total, 1);
});

test("acceptance host collections support direct orderBy/skip/limit chains without where filters", async () => {
  const database = createAcceptanceDatabase();
  await database.collection("credit_ledger").doc("ledger-1").set({
    id: "ledger-1",
    createdAt: "2026-06-19T00:00:00.000Z",
  });
  await database.collection("credit_ledger").doc("ledger-2").set({
    id: "ledger-2",
    createdAt: "2026-06-20T00:00:00.000Z",
  });

  const result = await database
    .collection("credit_ledger")
    .orderBy("createdAt", "desc")
    .skip(0)
    .limit(1)
    .get();

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, "ledger-2");
});
