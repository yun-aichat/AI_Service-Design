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
      async listAiActionPricing() {
        return {
          items: [
            {
              pricingId: "journey-map:proposal:standard",
              toolKey: "journey-map",
              actionKey: "proposal",
              tierKey: "standard",
              creditCost: 15,
              enabled: true,
            },
          ],
        };
      },
      async listAiModelPolicies() {
        return { items: [] };
      },
      async recordAiUsageEvent() {
        return {};
      },
    },
    billingService: {
      async reserveCredits() {
        return {
          reservation: { id: "reservation-1", status: "reserved" },
          account: { availableCredits: 85, reservedCredits: 15, consumedCredits: 0 },
        };
      },
      async commitCredits() {
        return {
          reservation: { id: "reservation-1", status: "committed" },
          account: { availableCredits: 85, reservedCredits: 0, consumedCredits: 15 },
        };
      },
      async releaseCredits() {
        return {
          reservation: { id: "reservation-1", status: "released" },
          account: { availableCredits: 100, reservedCredits: 0, consumedCredits: 0 },
        };
      },
    },
  });

  assert.ok(service);
  assert.equal(typeof service.handleRequest, "function");
});
