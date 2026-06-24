const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HARD_PERSONA_INPUT_LIMIT,
  PERSONA_READ_ERROR_CODES,
  SOFT_PERSONA_INPUT_LIMIT,
  PersonaReadError,
} = require("./protocol.cjs");
const {
  estimateResolvedPersonaInputLength,
  mapPersonaDocumentToResolvedPersonaInput,
  renderResolvedPersonaInput,
} = require("./mapping.cjs");

function createPersonaDocument(overrides = {}) {
  const base = {
    id: "persona-1",
    skeleton: {
      id: "skeleton-1",
      segmentName: "高自主高信任型用户",
      summary: "习惯先自助判断，再决定是否寻求人工帮助。",
      seedInsightIds: ["behavior-1"],
    },
    profile: {
      name: "林真",
      age: 29,
      avatarUrl: "https://example.com/avatar.png",
      occupation: "服务设计师",
      city: "上海",
      incomeBand: "20k-30k",
      familyBackground: "与伴侣同住",
      educationBackground: "硕士",
      roleTags: ["核心用户", "高频预约"],
    },
    evidenceItems: [
      {
        id: "evidence-1",
        sourceKind: "imported_file",
        sourceLabel: "访谈 A",
        quote: "我通常会先自己查清楚流程。",
        createdAt: "2026-06-20T00:00:00.000Z",
        tags: ["autonomy"],
        linkedInsightIds: ["behavior-1"],
      },
      {
        id: "evidence-2",
        sourceKind: "imported_file",
        sourceLabel: "访谈 B",
        quote: "如果说明讲得清楚，我会直接继续。",
        createdAt: "2026-06-20T00:00:00.000Z",
        tags: ["trust"],
        linkedInsightIds: ["context-1"],
      },
      {
        id: "evidence-3",
        sourceKind: "manual_note",
        sourceLabel: "补充记录",
        quote: "我不想被重复催促。",
        createdAt: "2026-06-20T00:00:00.000Z",
        tags: ["avoidance"],
        linkedInsightIds: ["pool-context-1"],
      },
    ],
    behaviorInsights: [
      {
        id: "behavior-1",
        kind: "behavior",
        summary: "遇到复杂服务时，会先自行整理规则与替代方案。",
        semanticTags: ["autonomy_high"],
        evidenceIds: ["evidence-1"],
        sourceLabels: ["访谈 A"],
        sampleSize: 1,
        confidence: "high",
        fit: "high",
        placement: "in_persona",
      },
      {
        id: "behavior-2",
        kind: "behavior",
        summary: "偶尔会为了促销改换服务商。",
        semanticTags: ["promotion_sensitive"],
        evidenceIds: ["evidence-2"],
        sourceLabels: ["访谈 B"],
        sampleSize: 1,
        confidence: "medium",
        fit: "medium",
        placement: "pool",
      },
    ],
    contextInsights: [
      {
        id: "context-1",
        kind: "context",
        summary: "当页面说明清楚时，愿意快速继续下一步。",
        semanticTags: ["trust_high"],
        evidenceIds: ["evidence-2"],
        sourceLabels: ["访谈 B"],
        sampleSize: 1,
        confidence: "high",
        fit: "high",
        placement: "in_persona",
      },
      {
        id: "pool-context-1",
        kind: "context",
        summary: "对反复催促的场景会明显反感。",
        semanticTags: ["pushy_service_avoidance"],
        evidenceIds: ["evidence-3"],
        sourceLabels: ["补充记录"],
        sampleSize: 1,
        confidence: "medium",
        fit: "low",
        placement: "pool",
      },
    ],
    traits: {
      patienceTolerance: {
        suggested: 3,
        confirmed: 4,
        confidence: "medium",
        rationale: "对明确流程有耐心。",
        supportingInsightIds: ["context-1"],
      },
      riskTolerance: {
        suggested: 2,
        confirmed: 2,
        confidence: "medium",
        rationale: "倾向先看清风险再决定。",
        supportingInsightIds: ["behavior-1"],
      },
      autonomy: {
        suggested: 5,
        confirmed: 5,
        confidence: "high",
        rationale: "有稳定的自助处理倾向。",
        supportingInsightIds: ["behavior-1"],
      },
      trustTendency: {
        suggested: 4,
        confirmed: 4,
        confidence: "high",
        rationale: "当服务方说明清楚时会建立信任。",
        supportingInsightIds: ["context-1"],
      },
    },
    summaryItems: [
      {
        id: "need-1",
        kind: "need",
        text: "需要清晰、一致的流程说明。",
        confidence: "high",
        supportingInsightIds: ["context-1"],
        confirmed: true,
      },
      {
        id: "preference-1",
        kind: "preference",
        text: "偏好先自助完成大部分步骤。",
        confidence: "high",
        supportingInsightIds: ["behavior-1"],
        confirmed: true,
      },
      {
        id: "avoidance-1",
        kind: "avoidance",
        text: "反感重复催促和含糊承诺。",
        confidence: "medium",
        supportingInsightIds: ["pool-context-1"],
        confirmed: true,
      },
      {
        id: "need-2",
        kind: "need",
        text: "这条未确认摘要不应进入 Journey 输入。",
        confidence: "low",
        supportingInsightIds: ["behavior-2"],
        confirmed: false,
      },
    ],
    meta: {
      version: 1,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z",
    },
  };

  return merge(base, overrides);
}

function merge(base, overrides) {
  if (!overrides || typeof overrides !== "object") return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = merge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

test("mapPersonaDocumentToResolvedPersonaInput maps the stable persona asset shape", () => {
  const input = mapPersonaDocumentToResolvedPersonaInput({
    projectId: "project-1",
    personaDocument: createPersonaDocument(),
  });

  assert.deepEqual(input, {
    personaId: "persona-1",
    projectId: "project-1",
    segmentName: "高自主高信任型用户",
    profileName: "林真",
    oneLineSummary: "习惯先自助判断，再决定是否寻求人工帮助。",
    roleTags: ["核心用户", "高频预约"],
    baseProfile: {
      age: 29,
      occupation: "服务设计师",
      city: "上海",
      incomeBand: "20k-30k",
      familyBackground: "与伴侣同住",
      educationBackground: "硕士",
    },
    traits: {
      patienceTolerance: 4,
      riskTolerance: 2,
      autonomy: 5,
      trustTendency: 4,
    },
    needs: ["需要清晰、一致的流程说明。"],
    preferences: ["偏好先自助完成大部分步骤。"],
    avoidances: ["反感重复催促和含糊承诺。"],
    behaviorSummaries: ["遇到复杂服务时，会先自行整理规则与替代方案。"],
    contextSummaries: ["当页面说明清楚时，愿意快速继续下一步。"],
    sourceMeta: {
      behaviorInsightCount: 1,
      contextInsightCount: 1,
      evidenceCount: 2,
      updatedAt: "2026-06-23T00:00:00.000Z",
    },
  });
});

test("mapPersonaDocumentToResolvedPersonaInput rejects documents without confirmed traits", () => {
  const personaDocument = createPersonaDocument({
    traits: {
      autonomy: {
        suggested: 5,
        confirmed: undefined,
      },
    },
  });

  assert.throws(
    () =>
      mapPersonaDocumentToResolvedPersonaInput({
        projectId: "project-1",
        personaDocument,
      }),
    (error) =>
      error instanceof PersonaReadError &&
      error.code === PERSONA_READ_ERROR_CODES.PERSONA_DOCUMENT_INVALID,
  );
});

test("mapPersonaDocumentToResolvedPersonaInput compresses only behavior and context summaries after the soft limit", () => {
  const longSummary = "在复杂服务里会反复对照说明和备选路径，以免自己被不确定信息推着走。".repeat(28);
  const personaDocument = createPersonaDocument({
    behaviorInsights: [
      {
        id: "behavior-1",
        kind: "behavior",
        summary: longSummary,
        semanticTags: ["autonomy_high"],
        evidenceIds: ["evidence-1"],
        sourceLabels: ["访谈 A"],
        sampleSize: 1,
        confidence: "high",
        fit: "high",
        placement: "in_persona",
      },
      {
        id: "behavior-2",
        kind: "behavior",
        summary: longSummary,
        semanticTags: ["autonomy_high"],
        evidenceIds: ["evidence-1"],
        sourceLabels: ["访谈 A"],
        sampleSize: 1,
        confidence: "high",
        fit: "high",
        placement: "in_persona",
      },
    ],
    contextInsights: [
      {
        id: "context-1",
        kind: "context",
        summary: longSummary,
        semanticTags: ["trust_high"],
        evidenceIds: ["evidence-2"],
        sourceLabels: ["访谈 B"],
        sampleSize: 1,
        confidence: "high",
        fit: "high",
        placement: "in_persona",
      },
      {
        id: "context-2",
        kind: "context",
        summary: longSummary,
        semanticTags: ["trust_high"],
        evidenceIds: ["evidence-2"],
        sourceLabels: ["访谈 B"],
        sampleSize: 1,
        confidence: "high",
        fit: "high",
        placement: "in_persona",
      },
    ],
  });

  const rawInput = mapPersonaDocumentToResolvedPersonaInput({
    projectId: "project-1",
    personaDocument,
    applyLengthRules: false,
  });
  const compressedInput = mapPersonaDocumentToResolvedPersonaInput({
    projectId: "project-1",
    personaDocument,
  });

  assert.ok(
    estimateResolvedPersonaInputLength(rawInput) > SOFT_PERSONA_INPUT_LIMIT,
    "expected raw persona input to exceed the soft limit",
  );
  assert.ok(
    estimateResolvedPersonaInputLength(rawInput) < HARD_PERSONA_INPUT_LIMIT,
    "expected raw persona input to stay under the hard limit",
  );
  assert.ok(
    estimateResolvedPersonaInputLength(compressedInput) <= SOFT_PERSONA_INPUT_LIMIT,
    "expected compressed persona input to fit within the soft limit",
  );
  assert.deepEqual(compressedInput.baseProfile, rawInput.baseProfile);
  assert.deepEqual(compressedInput.traits, rawInput.traits);
  assert.deepEqual(compressedInput.needs, rawInput.needs);
  assert.deepEqual(compressedInput.preferences, rawInput.preferences);
  assert.deepEqual(compressedInput.avoidances, rawInput.avoidances);
  assert.notDeepEqual(compressedInput.behaviorSummaries, rawInput.behaviorSummaries);
  assert.notDeepEqual(compressedInput.contextSummaries, rawInput.contextSummaries);
});

test("mapPersonaDocumentToResolvedPersonaInput raises PERSONA_INPUT_TOO_LARGE over the hard limit", () => {
  const personaDocument = createPersonaDocument({
    skeleton: {
      summary: "极长摘要".repeat(1200),
    },
  });

  assert.throws(
    () =>
      mapPersonaDocumentToResolvedPersonaInput({
        projectId: "project-1",
        personaDocument,
      }),
    (error) =>
      error instanceof PersonaReadError &&
      error.code === PERSONA_READ_ERROR_CODES.PERSONA_INPUT_TOO_LARGE,
  );
});

test("renderResolvedPersonaInput is deterministic for length accounting", () => {
  const input = mapPersonaDocumentToResolvedPersonaInput({
    projectId: "project-1",
    personaDocument: createPersonaDocument(),
  });

  const rendered = renderResolvedPersonaInput(input);
  assert.match(rendered, /personaId: persona-1/);
  assert.match(rendered, /segmentName: 高自主高信任型用户/);
  assert.equal(rendered.length, estimateResolvedPersonaInputLength(input));
});
