const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createBillingService,
  InMemoryBillingRepository,
  buildIdempotencyKey,
  buildReferenceId,
} = require("../billing/index.cjs");
const {
  createBillingConfigService,
  InMemoryBillingConfigRepository,
} = require("../billing-config.cjs");
const {
  normalizeJourneyGenerationResponse,
} = require("./protocol.cjs");
const {
  ACTION_KEYS,
  JOURNEY_GENERATION_ERROR_CODES,
  JourneyGenerationServiceError,
  createJourneyGenerationService,
} = require("./service.cjs");

const USER_ID = "user-1";

function createValidRequest(overrides = {}) {
  return {
    projectId: "project-1",
    source: "chat_confirm",
    scenario: "用户预约线下体验课",
    coreTask: "完成课程预约并准时到场",
    scope: "从看到活动到顺利签到",
    extraNotes: "优先关注首次报名的新用户",
    personaIds: ["persona-1", "persona-2"],
    ...overrides,
  };
}

function createResolvedPersonaInput(personaId, name) {
  return {
    personaId,
    projectId: "project-1",
    segmentName: `${name}群体`,
    profileName: name,
    oneLineSummary: `${name}希望更稳地完成预约。`,
    roleTags: ["报名用户"],
    baseProfile: {
      occupation: "白领",
    },
    traits: {
      patienceTolerance: 2,
      riskTolerance: 2,
      autonomy: 3,
      trustTendency: 3,
    },
    needs: ["需要清晰的预约确认"],
    preferences: ["偏好移动端完成操作"],
    avoidances: ["不愿意重复填写信息"],
    behaviorSummaries: ["会先确认时间和地点是否靠谱"],
    contextSummaries: ["下班后时间紧张"],
    sourceMeta: {
      behaviorInsightCount: 1,
      contextInsightCount: 1,
      evidenceCount: 2,
      updatedAt: "2026-06-27T00:00:00.000Z",
    },
  };
}

function createJourneySkeleton() {
  return {
    scenario: "用户预约线下体验课",
    coreTask: "完成课程预约并准时到场",
    scope: "从看到活动到顺利签到",
    stages: [
      {
        id: "discover",
        title: "发现活动",
        steps: [
          {
            id: "view-landing",
            title: "查看活动页",
            touchpoints: ["活动海报", "活动详情页"],
          },
        ],
      },
      {
        id: "reserve",
        title: "完成预约",
        steps: [
          {
            id: "submit-form",
            title: "提交预约信息",
            touchpoints: ["预约表单", "确认短信"],
          },
        ],
      },
    ],
  };
}

function createPersonaRunResult(personaId, personaName) {
  return {
    personaId,
    personaName,
    scenario: "用户预约线下体验课",
    coreTask: "完成课程预约并准时到场",
    scope: "从看到活动到顺利签到",
    stageResults: [
      {
        stageId: "discover",
        stepResults: [
          {
            stepId: "view-landing",
            thoughts: ["先判断课程是否可信"],
            feelings: ["谨慎"],
            behaviors: ["快速浏览活动页重点信息"],
            painPoints: ["活动亮点不够直白"],
            itchPoints: ["希望更快看到时间地点"],
            delightPoints: [],
          },
        ],
      },
      {
        stageId: "reserve",
        stepResults: [
          {
            stepId: "submit-form",
            thoughts: ["确认后就不想再重复输入"],
            feelings: ["希望省事"],
            behaviors: ["填写前先找是否支持自动补全"],
            painPoints: ["确认信息出现过晚"],
            itchPoints: ["希望提交后立即收到提醒"],
            delightPoints: ["提交成功后马上收到短信"],
          },
        ],
      },
    ],
    keyFindings: [`${personaName}很在意确认反馈是否及时`],
  };
}

function createJourneySynthesisResult() {
  return {
    skeleton: createJourneySkeleton(),
    mergedRows: {
      thoughts: [
        {
          stepId: "view-landing",
          summary: "用户会先判断活动是否可信且值得投入时间。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
        {
          stepId: "submit-form",
          summary: "提交前会确认是否要重复输入已有信息。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
      ],
      feelings: [
        {
          stepId: "view-landing",
          summary: "首次接触时偏谨慎。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
        {
          stepId: "submit-form",
          summary: "希望流程干脆明确。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
      ],
      behaviors: [
        {
          stepId: "view-landing",
          summary: "会先扫一遍时间地点与课程可信度。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
        {
          stepId: "submit-form",
          summary: "会优先寻找低摩擦填写路径。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
      ],
      painPoints: [
        {
          stepId: "view-landing",
          summary: "活动页关键信息层级不够清晰。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
        {
          stepId: "submit-form",
          summary: "确认与提醒反馈出现偏晚。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
      ],
      itchPoints: [
        {
          stepId: "view-landing",
          summary: "希望更早看到课程时间地点与适合人群。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
        {
          stepId: "submit-form",
          summary: "希望提交后立刻收到下一步提醒。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
      ],
      delightPoints: [
        {
          stepId: "view-landing",
          summary: "活动页直接给出明确收益点会提升兴趣。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
        {
          stepId: "submit-form",
          summary: "提交成功后即时短信确认会显著增强安心感。",
          supportingPersonaIds: ["persona-1", "persona-2"],
        },
      ],
    },
    analysis: {
      opportunities: ["在活动页首屏提前暴露关键信息与可信背书。"],
      differences: ["新用户更依赖即时确认反馈，熟手更关注操作成本。"],
    },
  };
}

function createJourneyBillingHarness({
  actionPricingOverrides = {},
  modelPolicyOverrides = {},
} = {}) {
  const billingRepository = new InMemoryBillingRepository();
  const billingService = createBillingService({
    repository: billingRepository,
    now: (() => {
      let tick = 0;
      return () => `2026-06-27T00:00:0${tick++}.000Z`;
    })(),
    createId: (() => {
      let tick = 0;
      return (prefix) => `${prefix}-${++tick}`;
    })(),
  });

  const billingConfigService = createBillingConfigService({
    repository: new InMemoryBillingConfigRepository({
      aiActionPricing: {
        "journey-map:skeleton_generate:standard": {
          id: "journey-map:skeleton_generate:standard",
          pricingId: "journey-map:skeleton_generate:standard",
          toolKey: "journey-map",
          actionKey: ACTION_KEYS.SKELETON_GENERATE,
          tierKey: "standard",
          displayName: "Journey Skeleton Generate",
          creditCost: 5,
          enabled: true,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        "journey-map:persona_run:standard": {
          id: "journey-map:persona_run:standard",
          pricingId: "journey-map:persona_run:standard",
          toolKey: "journey-map",
          actionKey: ACTION_KEYS.PERSONA_RUN,
          tierKey: "standard",
          displayName: "Journey Persona Run",
          creditCost: 4,
          enabled: true,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        "journey-map:journey_synthesis:standard": {
          id: "journey-map:journey_synthesis:standard",
          pricingId: "journey-map:journey_synthesis:standard",
          toolKey: "journey-map",
          actionKey: ACTION_KEYS.JOURNEY_SYNTHESIS,
          tierKey: "standard",
          displayName: "Journey Synthesis",
          creditCost: 7,
          enabled: true,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        ...actionPricingOverrides,
      },
      aiModelPolicies: {
        "journey-map:skeleton_generate": {
          id: "journey-map:skeleton_generate",
          policyId: "journey-map:skeleton_generate",
          toolKey: "journey-map",
          actionKey: ACTION_KEYS.SKELETON_GENERATE,
          providerKey: "openai",
          modelKey: "gpt-5.1",
          provider: "openai",
          model: "gpt-5.1",
          endpoint: "https://api.openai.test/skeleton",
          apiKeyRef: "key-skeleton",
          temperature: 0.4,
          maxInputTokens: 16000,
          maxOutputTokens: 4000,
          timeoutMs: 30000,
          enabled: true,
          version: 1,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        "journey-map:persona_run": {
          id: "journey-map:persona_run",
          policyId: "journey-map:persona_run",
          toolKey: "journey-map",
          actionKey: ACTION_KEYS.PERSONA_RUN,
          providerKey: "openai",
          modelKey: "gpt-5-mini",
          provider: "openai",
          model: "gpt-5-mini",
          endpoint: "https://api.openai.test/persona",
          apiKeyRef: "key-persona",
          temperature: 0.4,
          maxInputTokens: 16000,
          maxOutputTokens: 4000,
          timeoutMs: 30000,
          enabled: true,
          version: 1,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        "journey-map:journey_synthesis": {
          id: "journey-map:journey_synthesis",
          policyId: "journey-map:journey_synthesis",
          toolKey: "journey-map",
          actionKey: ACTION_KEYS.JOURNEY_SYNTHESIS,
          providerKey: "anthropic",
          modelKey: "claude-sonnet-4",
          provider: "anthropic",
          model: "claude-sonnet-4",
          endpoint: "https://api.anthropic.test/synthesis",
          apiKeyRef: "key-synthesis",
          temperature: 0.3,
          maxInputTokens: 16000,
          maxOutputTokens: 4000,
          timeoutMs: 30000,
          enabled: true,
          version: 1,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        ...modelPolicyOverrides,
      },
    }),
    now: () => "2026-06-27T00:00:00.000Z",
  });

  return {
    billingRepository,
    billingService,
    billingConfigService,
  };
}

async function seedCredits(billingService, accountId = USER_ID, credits = 200) {
  const referenceId = buildReferenceId({ scope: "order", id: `seed-${accountId}` });
  await billingService.purchaseCredits({
    accountId,
    orderId: `order-${accountId}`,
    referenceType: "order",
    referenceId,
    credits,
    idempotencyKey: buildIdempotencyKey({
      scope: "credit.purchase",
      referenceId,
      requestId: "seed",
    }),
  });
}

function createHarness(overrides = {}) {
  const billingHarness = createJourneyBillingHarness(overrides.billing || {});
  const personaCalls = [];
  const generatorCalls = [];
  const saveCalls = [];
  const service = createJourneyGenerationService({
    personaService: overrides.personaService || {
      async getPersonaInputs(input) {
        personaCalls.push(input);
        return {
          personas: [
            createResolvedPersonaInput("persona-1", "首次报名用户"),
            createResolvedPersonaInput("persona-2", "高频体验课用户"),
          ],
        };
      },
    },
    billingService: billingHarness.billingService,
    billingConfigService: billingHarness.billingConfigService,
    skeletonGenerator: overrides.skeletonGenerator || {
      async generate(input) {
        generatorCalls.push(["skeleton", input]);
        return createJourneySkeleton();
      },
    },
    personaRunner: overrides.personaRunner || {
      async run(input) {
        generatorCalls.push(["persona", input.persona.personaId]);
        return createPersonaRunResult(input.persona.personaId, input.persona.profileName);
      },
    },
    synthesizer: overrides.synthesizer || {
      async synthesize(input) {
        generatorCalls.push(["synthesis", input.runResults.length]);
        return createJourneySynthesisResult();
      },
    },
    saveJourneyResult: overrides.saveJourneyResult || (async (input) => {
      saveCalls.push(input);
      return {
        documentId: "journey-doc-1",
        revision: 7,
      };
    }),
    createRunId: (() => {
      let tick = 0;
      return () => `journey-run-${++tick}`;
    })(),
  });

  return {
    billingHarness,
    generatorCalls,
    personaCalls,
    saveCalls,
    service,
  };
}

test("journey generation rejects invalid requests before any model or billing work starts", async () => {
  const { service, generatorCalls, personaCalls } = createHarness();

  await assert.rejects(
    () =>
      service.generateJourney(
        createValidRequest({ scenario: "   " }),
        { user: { id: USER_ID } },
      ),
    (error) =>
      error instanceof JourneyGenerationServiceError &&
      error.code === JOURNEY_GENERATION_ERROR_CODES.JOURNEY_REQUEST_INVALID,
  );

  assert.equal(personaCalls.length, 0);
  assert.deepEqual(generatorCalls, []);
});

test("journey generation surfaces persona input failures with a dedicated error", async () => {
  const { service, generatorCalls } = createHarness({
    personaService: {
      async getPersonaInputs() {
        const error = new Error("persona missing");
        error.code = "PERSONA_NOT_FOUND";
        throw error;
      },
    },
  });

  await assert.rejects(
    () => service.generateJourney(createValidRequest(), { user: { id: USER_ID } }),
    (error) =>
      error instanceof JourneyGenerationServiceError &&
      error.code === JOURNEY_GENERATION_ERROR_CODES.JOURNEY_PERSONA_UNAVAILABLE &&
      /PERSONA_NOT_FOUND/.test(error.message),
  );

  assert.deepEqual(generatorCalls, []);
});

test("journey generation fails fast when billing action pricing is unavailable", async () => {
  const { service, generatorCalls } = createHarness({
    billing: {
      actionPricingOverrides: {
        "journey-map:persona_run:standard": {
          id: "journey-map:persona_run:standard",
          pricingId: "journey-map:persona_run:standard",
          toolKey: "journey-map",
          actionKey: ACTION_KEYS.PERSONA_RUN,
          tierKey: "standard",
          displayName: "Journey Persona Run",
          creditCost: 4,
          enabled: false,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
      },
    },
  });

  await assert.rejects(
    () => service.generateJourney(createValidRequest(), { user: { id: USER_ID } }),
    (error) =>
      error instanceof JourneyGenerationServiceError &&
      error.code === JOURNEY_GENERATION_ERROR_CODES.JOURNEY_BILLING_ACTION_UNAVAILABLE &&
      /persona_run/.test(error.message),
  );

  assert.deepEqual(generatorCalls, []);
});

test("journey generation fails fast when model policy is unavailable", async () => {
  const { service, generatorCalls } = createHarness({
    billing: {
      modelPolicyOverrides: {
        "journey-map:journey_synthesis": {
          id: "journey-map:journey_synthesis",
          policyId: "journey-map:journey_synthesis",
          toolKey: "journey-map",
          actionKey: ACTION_KEYS.JOURNEY_SYNTHESIS,
          providerKey: "anthropic",
          modelKey: "claude-sonnet-4",
          provider: "anthropic",
          model: "claude-sonnet-4",
          endpoint: "https://api.anthropic.test/synthesis",
          apiKeyRef: "key-synthesis",
          temperature: 0.3,
          maxInputTokens: 16000,
          maxOutputTokens: 4000,
          timeoutMs: 30000,
          enabled: false,
          version: 1,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
      },
    },
  });

  await assert.rejects(
    () => service.generateJourney(createValidRequest(), { user: { id: USER_ID } }),
    (error) =>
      error instanceof JourneyGenerationServiceError &&
      error.code === JOURNEY_GENERATION_ERROR_CODES.JOURNEY_MODEL_POLICY_UNAVAILABLE &&
      /journey_synthesis/.test(error.message),
  );

  assert.deepEqual(generatorCalls, []);
});

test("journey generation releases reserved credits when a mid-run step fails", async () => {
  const { service, billingHarness } = createHarness({
    personaRunner: {
      async run(input) {
        if (input.persona.personaId === "persona-2") {
          throw new Error("provider timeout");
        }
        return createPersonaRunResult(input.persona.personaId, input.persona.profileName);
      },
    },
  });
  await seedCredits(billingHarness.billingService);

  await assert.rejects(
    () => service.generateJourney(createValidRequest(), { user: { id: USER_ID } }),
    (error) =>
      error instanceof JourneyGenerationServiceError &&
      error.code === JOURNEY_GENERATION_ERROR_CODES.JOURNEY_MODEL_CALL_FAILED,
  );

  const account = await billingHarness.billingService.getCreditAccount({ accountId: USER_ID });
  assert.equal(account.availableCredits, 200);
  assert.equal(account.reservedCredits, 0);
  assert.equal(account.consumedCredits, 0);
});

test("journey generation orchestrates persona resolution, model steps, save, and billing into a formal response", async () => {
  const { service, billingHarness, generatorCalls, personaCalls, saveCalls } = createHarness();
  await seedCredits(billingHarness.billingService);

  const response = await service.generateJourney(createValidRequest(), {
    user: { id: USER_ID },
  });

  normalizeJourneyGenerationResponse(response);
  assert.equal(personaCalls.length, 1);
  assert.deepEqual(
    generatorCalls.map((entry) => entry[0]),
    ["skeleton", "persona", "persona", "synthesis"],
  );
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].runId, "journey-run-1");
  assert.equal(response.runId, "journey-run-1");
  assert.equal(response.documentId, "journey-doc-1");
  assert.equal(response.revision, 7);
  assert.equal(response.billing.chargedCredits, 20);
  assert.deepEqual(response.billing.actionBreakdown, [
    { actionKey: ACTION_KEYS.SKELETON_GENERATE, credits: 5 },
    { actionKey: ACTION_KEYS.PERSONA_RUN, credits: 8 },
    { actionKey: ACTION_KEYS.JOURNEY_SYNTHESIS, credits: 7 },
  ]);
  assert.deepEqual(response.modelSummary, [
    { providerKey: "openai", modelKey: "gpt-5.1" },
    { providerKey: "openai", modelKey: "gpt-5-mini" },
    { providerKey: "anthropic", modelKey: "claude-sonnet-4" },
  ]);

  const account = await billingHarness.billingService.getCreditAccount({ accountId: USER_ID });
  assert.equal(account.availableCredits, 180);
  assert.equal(account.reservedCredits, 0);
  assert.equal(account.consumedCredits, 20);
});
