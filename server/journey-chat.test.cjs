const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getAssistantService,
  resetAssistantServiceForTests,
} = require("./journey-chat.cjs");

test("journey-chat initializes assistant service when billing config service is provided", () => {
  resetAssistantServiceForTests();

  const service = getAssistantService({
    modelProvider: {
      async generateJson() {
        return {
          model: "glm-test",
          content: JSON.stringify({ phase: "message", message: "ok" }),
        };
      },
    },
    toolDocumentService: {
      async recordUsageEvent() {
        return {};
      },
    },
    billingConfigService: {
      async listAiModelPolicies() {
        return { items: [] };
      },
      async recordAiUsageEvent() {
        return {};
      },
    },
  });

  assert.ok(service);
  assert.equal(typeof service.handleRequest, "function");
});
