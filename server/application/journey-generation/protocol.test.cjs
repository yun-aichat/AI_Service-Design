const assert = require("node:assert/strict");
const test = require("node:test");

const {
  JOURNEY_GENERATION_PROTOCOL_ERROR_CODES,
  JourneyGenerationProtocolError,
  JOURNEY_GENERATION_REQUEST_SOURCES,
  JOURNEY_SYNTHESIS_ROW_KEYS,
  normalizeJourneyGenerationRequest,
  normalizeJourneySkeleton,
  normalizePersonaRunResult,
  normalizeJourneySynthesisResult,
  normalizeJourneyGenerationResponse,
} = require("./protocol.cjs");

function createValidRequest() {
  return {
    projectId: " project-1 ",
    source: "chat_confirm",
    scenario: " 用户在机场值机 ",
    coreTask: " 完成托运行李 ",
    scope: " 从到达柜台到拿到登机牌 ",
    extraNotes: " 优先关注首次出境用户 ",
    personaIds: [" persona-1 ", "persona-2"],
  };
}

function createValidSkeleton() {
  return {
    scenario: "用户在机场值机",
    coreTask: "完成托运行李",
    scope: "从到达柜台到拿到登机牌",
    stages: [
      {
        id: "arrive",
        title: "到达柜台",
        steps: [
          {
            id: "queue",
            title: "排队等候",
            touchpoints: ["柜台叫号屏", "现场工作人员"],
          },
        ],
      },
      {
        id: "check-in",
        title: "办理值机",
        steps: [
          {
            id: "handoff",
            title: "提交证件与行李",
            touchpoints: [],
          },
        ],
      },
    ],
  };
}

function createValidPersonaRunResult() {
  return {
    personaId: "persona-1",
    personaName: "首次出境家庭旅客",
    scenario: "用户在机场值机",
    coreTask: "完成托运行李",
    scope: "从到达柜台到拿到登机牌",
    stageResults: [
      {
        stageId: "arrive",
        stepResults: [
          {
            stepId: "queue",
            thoughts: ["队伍比预想更长"],
            feelings: ["焦虑"],
            behaviors: ["反复查看队伍进度"],
            painPoints: ["不知道哪条队伍更快"],
            itchPoints: ["希望有明确分流提示"],
            delightPoints: [],
          },
        ],
      },
      {
        stageId: "check-in",
        stepResults: [
          {
            stepId: "handoff",
            thoughts: ["终于轮到我了"],
            feelings: ["松一口气"],
            behaviors: ["主动提前拿出证件"],
            painPoints: [],
            itchPoints: [],
            delightPoints: ["工作人员主动提醒后续安检流程"],
          },
        ],
      },
    ],
    keyFindings: ["分流提示不清晰会显著放大新手旅客焦虑"],
  };
}

function createValidJourneySynthesisResult() {
  return {
    skeleton: createValidSkeleton(),
    mergedRows: {
      thoughts: [
        {
          stepId: "queue",
          summary: "旅客在排队时会持续判断等待成本。",
          supportingPersonaIds: ["persona-1"],
        },
        {
          stepId: "handoff",
          summary: "到达柜台后会快速切换到证件准备状态。",
          supportingPersonaIds: ["persona-1"],
          contrastingPersonaIds: ["persona-2"],
        },
      ],
      feelings: [
        {
          stepId: "queue",
          summary: "等待期间焦虑感明显。",
          supportingPersonaIds: ["persona-1"],
        },
        {
          stepId: "handoff",
          summary: "开始办理时会短暂放松。",
          supportingPersonaIds: ["persona-1"],
        },
      ],
      behaviors: [
        {
          stepId: "queue",
          summary: "会频繁观察队伍前进速度。",
          supportingPersonaIds: ["persona-1"],
        },
        {
          stepId: "handoff",
          summary: "会提前准备证件和行李标签。",
          supportingPersonaIds: ["persona-1"],
        },
      ],
      painPoints: [
        {
          stepId: "queue",
          summary: "缺少清晰分流信息。",
          supportingPersonaIds: ["persona-1"],
        },
        {
          stepId: "handoff",
          summary: "证件要求提醒出现过晚。",
          supportingPersonaIds: ["persona-1"],
        },
      ],
      itchPoints: [
        {
          stepId: "queue",
          summary: "希望更早获得预计等待时长。",
          supportingPersonaIds: ["persona-1"],
        },
        {
          stepId: "handoff",
          summary: "希望有柜台流程速览。",
          supportingPersonaIds: ["persona-1"],
        },
      ],
      delightPoints: [
        {
          stepId: "queue",
          summary: "现场引导员主动分流会显著缓解压力。",
          supportingPersonaIds: ["persona-1"],
        },
        {
          stepId: "handoff",
          summary: "工作人员主动提醒后续动作会提升安心感。",
          supportingPersonaIds: ["persona-1"],
        },
      ],
    },
    analysis: {
      opportunities: ["在排队区补充更早的分流与等待提示。"],
      differences: ["新手旅客对流程确定性的需求高于高频商务旅客。"],
    },
  };
}

function createValidJourneyGenerationResponse() {
  return {
    runId: "run-1",
    documentId: "journey-1",
    revision: 3,
    result: createValidJourneySynthesisResult(),
    billing: {
      chargedCredits: 18,
      actionBreakdown: [
        { actionKey: "journey_skeleton_generate", credits: 5 },
        { actionKey: "journey_persona_run", credits: 13 },
      ],
    },
    modelSummary: [
      { providerKey: "openai", modelKey: "gpt-5.1" },
      { providerKey: "openai", modelKey: "gpt-5-mini" },
    ],
  };
}

test("protocol exposes the complete journey generation request source set", () => {
  assert.deepEqual(JOURNEY_GENERATION_REQUEST_SOURCES, [
    "chat_confirm",
    "form_confirm",
  ]);
});

test("protocol exposes the complete synthesis row key set", () => {
  assert.deepEqual(JOURNEY_SYNTHESIS_ROW_KEYS, [
    "thoughts",
    "feelings",
    "behaviors",
    "painPoints",
    "itchPoints",
    "delightPoints",
  ]);
});

test("normalizeJourneyGenerationRequest trims and preserves a valid request", () => {
  const normalized = normalizeJourneyGenerationRequest(createValidRequest());

  assert.deepEqual(normalized, {
    projectId: "project-1",
    source: "chat_confirm",
    scenario: "用户在机场值机",
    coreTask: "完成托运行李",
    scope: "从到达柜台到拿到登机牌",
    extraNotes: "优先关注首次出境用户",
    personaIds: ["persona-1", "persona-2"],
  });
});

test("normalizeJourneyGenerationRequest rejects duplicated persona ids", () => {
  const request = createValidRequest();
  request.personaIds = ["persona-1", "persona-1"];

  assert.throws(
    () => normalizeJourneyGenerationRequest(request),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.JOURNEY_PERSONA_IDS_DUPLICATED,
  );
});

test("normalizeJourneyGenerationRequest rejects unsupported source", () => {
  const request = createValidRequest();
  request.source = "assistant";

  assert.throws(
    () => normalizeJourneyGenerationRequest(request),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
  );
});

test("normalizeJourneySkeleton preserves valid nested stages and steps", () => {
  const normalized = normalizeJourneySkeleton(createValidSkeleton());

  assert.equal(normalized.stages[0].steps[0].touchpoints[0], "柜台叫号屏");
  assert.deepEqual(normalized.stages[1].steps[0].touchpoints, []);
});

test("normalizeJourneySkeleton rejects duplicated stage ids", () => {
  const skeleton = createValidSkeleton();
  skeleton.stages[1].id = "arrive";

  assert.throws(
    () => normalizeJourneySkeleton(skeleton),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
  );
});

test("normalizeJourneySkeleton rejects duplicated step ids across the skeleton", () => {
  const skeleton = createValidSkeleton();
  skeleton.stages[1].steps[0].id = "queue";

  assert.throws(
    () => normalizeJourneySkeleton(skeleton),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
  );
});

test("normalizePersonaRunResult preserves valid aligned stage and step results", () => {
  const normalized = normalizePersonaRunResult(
    createValidPersonaRunResult(),
    createValidSkeleton(),
  );

  assert.equal(normalized.stageResults[0].stageId, "arrive");
  assert.equal(normalized.stageResults[1].stepResults[0].stepId, "handoff");
  assert.deepEqual(normalized.stageResults[1].stepResults[0].painPoints, []);
});

test("normalizePersonaRunResult rejects stageResults that do not align to the skeleton", () => {
  const result = createValidPersonaRunResult();
  result.stageResults = [result.stageResults[0]];

  assert.throws(
    () => normalizePersonaRunResult(result, createValidSkeleton()),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
  );
});

test("normalizePersonaRunResult rejects stepResults that do not align to the stage steps", () => {
  const result = createValidPersonaRunResult();
  result.stageResults[0].stepResults[0].stepId = "missing-step";

  assert.throws(
    () => normalizePersonaRunResult(result, createValidSkeleton()),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
  );
});

test("normalizeJourneySynthesisResult preserves valid merged rows and analysis", () => {
  const normalized = normalizeJourneySynthesisResult(createValidJourneySynthesisResult());

  assert.equal(normalized.mergedRows.thoughts[0].stepId, "queue");
  assert.deepEqual(normalized.analysis.opportunities, [
    "在排队区补充更早的分流与等待提示。",
  ]);
});

test("normalizeJourneySynthesisResult rejects row sets that do not cover all skeleton steps", () => {
  const result = createValidJourneySynthesisResult();
  result.mergedRows.thoughts = [result.mergedRows.thoughts[0]];

  assert.throws(
    () => normalizeJourneySynthesisResult(result),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
  );
});

test("normalizeJourneySynthesisResult rejects empty supportingPersonaIds", () => {
  const result = createValidJourneySynthesisResult();
  result.mergedRows.feelings[0].supportingPersonaIds = [];

  assert.throws(
    () => normalizeJourneySynthesisResult(result),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
  );
});

test("normalizeJourneyGenerationResponse preserves valid billing and model summary fields", () => {
  const normalized = normalizeJourneyGenerationResponse(
    createValidJourneyGenerationResponse(),
  );

  assert.equal(normalized.billing.chargedCredits, 18);
  assert.equal(normalized.billing.actionBreakdown[1].credits, 13);
  assert.equal(normalized.modelSummary[0].providerKey, "openai");
});

test("normalizeJourneyGenerationResponse rejects invalid revision", () => {
  const response = createValidJourneyGenerationResponse();
  response.revision = 0;

  assert.throws(
    () => normalizeJourneyGenerationResponse(response),
    (error) =>
      error instanceof JourneyGenerationProtocolError &&
      error.code === JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
  );
});
