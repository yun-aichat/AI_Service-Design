const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ASSISTANT_USAGE_EVENT,
} = require("./protocol.cjs");
const { createAssistantService } = require("./service.cjs");
const {
  createToolDocumentAssistantUsageRecorder,
} = require("./usage-recorder.cjs");

const request = {
  scope: "tool",
  toolId: "journey-map",
  skillId: "journey-map-editor",
  skillVersion: "1.0.0",
  document: {
    toolId: "journey-map",
    documentId: "doc-1",
    projectId: "project-1",
    schemaVersion: 1,
    revision: 3,
    title: "门店预约服务用户旅程图",
    content: {
      title: "门店预约服务用户旅程图",
      scenario: "用户预约门店服务。",
      persona: "预约用户",
      goal: "顺利到店",
      stages: [{ id: "stage-1", name: "发现需求" }],
      rows: [],
    },
  },
  context: {
    serviceName: "门店预约服务",
    toolName: "Journey Map",
    toolContext: {
      title: "门店预约服务用户旅程图",
      scenario: "用户预约门店服务。",
    },
    usageEventCandidate: "ai_generated",
  },
  messages: [
    {
      id: "message-1",
      role: "user",
      content: "请先确认目标用户。",
    },
  ],
};

test("assistant service preserves clarify response semantics", async () => {
  const modelCalls = [];
  const service = createAssistantService({
    readSkill: () => "skill prompt",
    modelProvider: {
      async generateJson(input) {
        modelCalls.push(input);
        return {
          model: "glm-test",
          content: JSON.stringify({
            phase: "clarify",
            message: "我需要先确认目标用户。",
            questions: ["这次服务主要面向哪类用户？"],
          }),
        };
      },
    },
  });

  const response = await service.handleRequest(request);
  assert.equal(response.phase, "clarify");
  assert.deepEqual(response.questions, ["这次服务主要面向哪类用户？"]);
  assert.match(modelCalls[0].systemPrompt, /正式 assistant 协议/);
  assert.match(modelCalls[0].systemPrompt, /门店预约服务用户旅程图/);
});

test("assistant service records ai_generated hook after valid proposal", async () => {
  const recorderCalls = [];
  const service = createAssistantService({
    readSkill: () => "skill prompt",
    modelProvider: {
      async generateJson() {
        return {
          model: "glm-test",
          content: JSON.stringify({
            phase: "proposal",
            message: "我整理了一版更新提案。",
            proposal: {
              summary: ["更新目标用户"],
              journey: {
                title: "AI 更新版",
              },
            },
          }),
        };
      },
    },
    usageRecorder: {
      async recordGenerated(entry) {
        recorderCalls.push(entry);
      },
    },
  });

  const response = await service.handleRequest(request, {
    user: { id: "user-1" },
  });

  assert.equal(response.phase, "proposal");
  assert.equal(recorderCalls.length, 1);
  assert.equal(recorderCalls[0].request.context.usageEventCandidate, ASSISTANT_USAGE_EVENT);
  assert.equal(recorderCalls[0].response.phase, "proposal");
  assert.equal(recorderCalls[0].model, "glm-test");
});

test("assistant service rejects proposal response without proposal payload", async () => {
  const service = createAssistantService({
    readSkill: () => "skill prompt",
    modelProvider: {
      async generateJson() {
        return {
          model: "glm-test",
          content: JSON.stringify({
            phase: "proposal",
            message: "缺少提案",
          }),
        };
      },
    },
  });

  await assert.rejects(
    () => service.handleRequest(request),
    /Proposal response must include proposal/,
  );
});

test("assistant service writes ai_generated with document context when request carries user and document identity", async () => {
  const recordedCalls = [];
  const service = createAssistantService({
    readSkill: () => "skill prompt",
    modelProvider: {
      async generateJson() {
        return {
          model: "glm-test",
          content: JSON.stringify({
            phase: "message",
            message: "已记录这次对话。",
          }),
        };
      },
    },
    usageRecorder: createToolDocumentAssistantUsageRecorder({
      toolDocumentService: {
        async recordUsageEvent(input) {
          recordedCalls.push(input);
          return input;
        },
      },
    }),
  });

  const response = await service.handleRequest(request, {
    user: { id: "user-1" },
  });

  assert.equal(response.phase, "message");
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].projectId, "project-1");
  assert.equal(recordedCalls[0].documentId, "doc-1");
  assert.equal(recordedCalls[0].revision, 3);
  assert.equal(recordedCalls[0].eventType, ASSISTANT_USAGE_EVENT);
});

test("assistant service reserves billing before generation and commits on proposal success", async () => {
  const billingCalls = [];
  const service = createAssistantService({
    readSkill: () => "skill prompt",
    modelProvider: {
      async generateJson() {
        return {
          model: "glm-test",
          content: JSON.stringify({
            phase: "proposal",
            message: "我整理了一版更新提案。",
            proposal: {
              summary: ["更新目标用户"],
              journey: { title: "AI 更新版" },
            },
          }),
        };
      },
    },
    billingSettlement: {
      async startRun(input) {
        billingCalls.push({ type: "start", input });
        return { runId: "assistant-run-1", reservationId: "reservation-1", referenceId: "ai_run:assistant-run-1" };
      },
      async finishRun(input) {
        billingCalls.push({ type: "finish", input });
        return { chargedCredits: 15 };
      },
    },
  });

  await service.handleRequest(request, { user: { id: "user-1" } });

  assert.equal(billingCalls.length, 2);
  assert.equal(billingCalls[0].type, "start");
  assert.equal(billingCalls[1].type, "finish");
  assert.equal(billingCalls[1].input.response.phase, "proposal");
});

test("assistant service releases billing reservations when generation ends in clarify or error", async () => {
  const billingCalls = [];
  const clarifyService = createAssistantService({
    readSkill: () => "skill prompt",
    modelProvider: {
      async generateJson() {
        return {
          model: "glm-test",
          content: JSON.stringify({
            phase: "clarify",
            message: "先确认目标用户。",
            questions: ["服务主要面向谁？"],
          }),
        };
      },
    },
    billingSettlement: {
      async startRun() {
        return { runId: "assistant-run-1", reservationId: "reservation-1", referenceId: "ai_run:assistant-run-1" };
      },
      async finishRun(input) {
        billingCalls.push(input);
        return { chargedCredits: 0 };
      },
    },
  });

  await clarifyService.handleRequest(request, { user: { id: "user-1" } });
  assert.equal(billingCalls[0].response.phase, "clarify");

  const errorService = createAssistantService({
    readSkill: () => "skill prompt",
    modelProvider: {
      async generateJson() {
        throw new Error("timeout");
      },
    },
    billingSettlement: {
      async startRun() {
        return { runId: "assistant-run-2", reservationId: "reservation-2", referenceId: "ai_run:assistant-run-2" };
      },
      async finishRun(input) {
        billingCalls.push(input);
        return { chargedCredits: 0 };
      },
    },
  });

  await assert.rejects(() => errorService.handleRequest(request, { user: { id: "user-1" } }), /timeout/);
  assert.equal(billingCalls[1].error, "timeout");
});
