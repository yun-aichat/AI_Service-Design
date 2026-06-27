const JOURNEY_GENERATION_REQUEST_SOURCES = Object.freeze([
  "chat_confirm",
  "form_confirm",
]);

const JOURNEY_SYNTHESIS_ROW_KEYS = Object.freeze([
  "thoughts",
  "feelings",
  "behaviors",
  "painPoints",
  "itchPoints",
  "delightPoints",
]);

const JOURNEY_GENERATION_PROTOCOL_ERROR_CODES = Object.freeze({
  INVALID_JOURNEY_GENERATION_REQUEST: "INVALID_JOURNEY_GENERATION_REQUEST",
  JOURNEY_PERSONA_IDS_EMPTY: "JOURNEY_PERSONA_IDS_EMPTY",
  JOURNEY_PERSONA_IDS_DUPLICATED: "JOURNEY_PERSONA_IDS_DUPLICATED",
  INVALID_JOURNEY_SKELETON: "INVALID_JOURNEY_SKELETON",
  INVALID_PERSONA_RUN_RESULT: "INVALID_PERSONA_RUN_RESULT",
  INVALID_JOURNEY_SYNTHESIS_RESULT: "INVALID_JOURNEY_SYNTHESIS_RESULT",
  INVALID_JOURNEY_GENERATION_RESPONSE: "INVALID_JOURNEY_GENERATION_RESPONSE",
});

class JourneyGenerationProtocolError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "JourneyGenerationProtocolError";
    this.code = code;
    this.status = status;
  }
}

function normalizeJourneyGenerationRequest(input) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
      "Journey generation request must be an object.",
    );
  }

  const source = requireString(
    input.source,
    "source",
    JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
  );
  if (!JOURNEY_GENERATION_REQUEST_SOURCES.includes(source)) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
      `Unsupported journey generation source "${source}".`,
    );
  }

  return {
    projectId: requireString(
      input.projectId,
      "projectId",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
    ),
    source,
    scenario: requireString(
      input.scenario,
      "scenario",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
    ),
    coreTask: requireString(
      input.coreTask,
      "coreTask",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
    ),
    scope: requireString(
      input.scope,
      "scope",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
    ),
    extraNotes: normalizeOptionalString(input.extraNotes),
    personaIds: normalizePersonaIds(input.personaIds),
  };
}

function normalizeJourneySkeleton(input) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
      "Journey skeleton must be an object.",
    );
  }

  const skeleton = {
    scenario: requireString(
      input.scenario,
      "scenario",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
    ),
    coreTask: requireString(
      input.coreTask,
      "coreTask",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
    ),
    scope: requireString(
      input.scope,
      "scope",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
    ),
    stages: normalizeStages(input.stages),
  };

  assertUniqueIds(
    skeleton.stages.map((stage) => stage.id),
    "Journey skeleton stage ids must be unique.",
    JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
  );
  assertUniqueIds(
    skeleton.stages.flatMap((stage) => stage.steps.map((step) => step.id)),
    "Journey skeleton step ids must be unique.",
    JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
  );

  return skeleton;
}

function normalizePersonaRunResult(input, skeletonInput) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      "Persona run result must be an object.",
    );
  }

  const skeleton = normalizeJourneySkeleton(skeletonInput);
  const stageResults = normalizeStageResults(input.stageResults);
  const skeletonStageIds = skeleton.stages.map((stage) => stage.id);
  const stageResultIds = stageResults.map((stageResult) => stageResult.stageId);

  if (!sameOrderedValues(stageResultIds, skeletonStageIds)) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      "stageResults must align with JourneySkeleton.stages.",
    );
  }

  for (let index = 0; index < skeleton.stages.length; index += 1) {
    const allowedStepIds = skeleton.stages[index].steps.map((step) => step.id);
    const stepResultIds = stageResults[index].stepResults.map((stepResult) => stepResult.stepId);
    if (!sameOrderedValues(stepResultIds, allowedStepIds)) {
      throw createJourneyProtocolError(
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
        "stepResults must align with the matching JourneySkeleton stage steps.",
      );
    }
  }

  return {
    personaId: requireString(
      input.personaId,
      "personaId",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
    ),
    personaName: requireString(
      input.personaName,
      "personaName",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
    ),
    scenario: requireString(
      input.scenario,
      "scenario",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
    ),
    coreTask: requireString(
      input.coreTask,
      "coreTask",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
    ),
    scope: requireString(
      input.scope,
      "scope",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
    ),
    stageResults,
    keyFindings: normalizeStringArray(
      input.keyFindings,
      "keyFindings",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
    ),
  };
}

function normalizeJourneySynthesisResult(input) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
      "Journey synthesis result must be an object.",
    );
  }

  const skeleton = normalizeJourneySkeleton(input.skeleton);
  const stepIds = skeleton.stages.flatMap((stage) => stage.steps.map((step) => step.id));

  return {
    skeleton,
    mergedRows: normalizeMergedRows(input.mergedRows, stepIds),
    analysis: normalizeAnalysis(input.analysis),
  };
}

function normalizeJourneyGenerationResponse(input) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
      "Journey generation response must be an object.",
      502,
    );
  }

  return {
    runId: requireString(
      input.runId,
      "runId",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
      502,
    ),
    documentId: requireString(
      input.documentId,
      "documentId",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
      502,
    ),
    revision: requirePositiveInteger(
      input.revision,
      "revision",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
      502,
    ),
    result: normalizeJourneySynthesisResult(input.result),
    billing: normalizeBilling(input.billing),
    modelSummary: normalizeModelSummary(input.modelSummary),
  };
}

function normalizePersonaIds(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.JOURNEY_PERSONA_IDS_EMPTY,
      "personaIds must contain at least one persona id.",
    );
  }

  const personaIds = input.map((entry, index) =>
    requireString(
      entry,
      `personaIds[${index}]`,
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_REQUEST,
    ),
  );
  if (new Set(personaIds).size !== personaIds.length) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.JOURNEY_PERSONA_IDS_DUPLICATED,
      "personaIds contains duplicated ids.",
    );
  }
  return personaIds;
}

function normalizeStages(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
      "stages must contain at least one stage.",
    );
  }

  return input.map((stage, stageIndex) => {
    if (!stage || typeof stage !== "object") {
      throw createJourneyProtocolError(
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
        `stages[${stageIndex}] must be an object.`,
      );
    }

    return {
      id: requireString(
        stage.id,
        `stages[${stageIndex}].id`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
      ),
      title: requireString(
        stage.title,
        `stages[${stageIndex}].title`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
      ),
      steps: normalizeSteps(stage.steps, stageIndex),
    };
  });
}

function normalizeSteps(input, stageIndex) {
  if (!Array.isArray(input) || input.length === 0) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
      `stages[${stageIndex}].steps must contain at least one step.`,
    );
  }

  return input.map((step, stepIndex) => {
    if (!step || typeof step !== "object") {
      throw createJourneyProtocolError(
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
        `stages[${stageIndex}].steps[${stepIndex}] must be an object.`,
      );
    }

    return {
      id: requireString(
        step.id,
        `stages[${stageIndex}].steps[${stepIndex}].id`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
      ),
      title: requireString(
        step.title,
        `stages[${stageIndex}].steps[${stepIndex}].title`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
      ),
      touchpoints: normalizeStringArray(
        step.touchpoints,
        `stages[${stageIndex}].steps[${stepIndex}].touchpoints`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SKELETON,
      ),
    };
  });
}

function normalizeStageResults(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      "stageResults must contain at least one stage result.",
    );
  }

  return input.map((stageResult, stageIndex) => {
    if (!stageResult || typeof stageResult !== "object") {
      throw createJourneyProtocolError(
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
        `stageResults[${stageIndex}] must be an object.`,
      );
    }

    return {
      stageId: requireString(
        stageResult.stageId,
        `stageResults[${stageIndex}].stageId`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      ),
      stepResults: normalizeStepResults(stageResult.stepResults, stageIndex),
    };
  });
}

function normalizeStepResults(input, stageIndex) {
  if (!Array.isArray(input) || input.length === 0) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      `stageResults[${stageIndex}].stepResults must contain at least one step result.`,
    );
  }

  return input.map((stepResult, stepIndex) => {
    if (!stepResult || typeof stepResult !== "object") {
      throw createJourneyProtocolError(
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
        `stageResults[${stageIndex}].stepResults[${stepIndex}] must be an object.`,
      );
    }

    return {
      stepId: requireString(
        stepResult.stepId,
        `stageResults[${stageIndex}].stepResults[${stepIndex}].stepId`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      ),
      thoughts: normalizeStringArray(
        stepResult.thoughts,
        `stageResults[${stageIndex}].stepResults[${stepIndex}].thoughts`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      ),
      feelings: normalizeStringArray(
        stepResult.feelings,
        `stageResults[${stageIndex}].stepResults[${stepIndex}].feelings`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      ),
      behaviors: normalizeStringArray(
        stepResult.behaviors,
        `stageResults[${stageIndex}].stepResults[${stepIndex}].behaviors`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      ),
      painPoints: normalizeStringArray(
        stepResult.painPoints,
        `stageResults[${stageIndex}].stepResults[${stepIndex}].painPoints`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      ),
      itchPoints: normalizeStringArray(
        stepResult.itchPoints,
        `stageResults[${stageIndex}].stepResults[${stepIndex}].itchPoints`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      ),
      delightPoints: normalizeStringArray(
        stepResult.delightPoints,
        `stageResults[${stageIndex}].stepResults[${stepIndex}].delightPoints`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_PERSONA_RUN_RESULT,
      ),
    };
  });
}

function normalizeMergedRows(input, requiredStepIds) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
      "mergedRows must be an object.",
    );
  }

  const mergedRows = {};
  for (const rowKey of JOURNEY_SYNTHESIS_ROW_KEYS) {
    const rowEntries = input[rowKey];
    if (!Array.isArray(rowEntries)) {
      throw createJourneyProtocolError(
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
        `mergedRows.${rowKey} must be an array.`,
      );
    }

    mergedRows[rowKey] = rowEntries.map((entry, index) =>
      normalizeRowCell(entry, `mergedRows.${rowKey}[${index}]`),
    );

    const stepIds = mergedRows[rowKey].map((entry) => entry.stepId);
    if (!sameOrderedValues(stepIds, requiredStepIds)) {
      throw createJourneyProtocolError(
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
        `mergedRows.${rowKey} must cover every skeleton step exactly once.`,
      );
    }
  }

  return mergedRows;
}

function normalizeRowCell(input, field) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
      `${field} must be an object.`,
    );
  }

  const supportingPersonaIds = normalizeStringArray(
    input.supportingPersonaIds,
    `${field}.supportingPersonaIds`,
    JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
  );
  if (supportingPersonaIds.length === 0) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
      `${field}.supportingPersonaIds must contain at least one persona id.`,
    );
  }

  const contrastingPersonaIds =
    input.contrastingPersonaIds === undefined
      ? null
      : normalizeStringArray(
          input.contrastingPersonaIds,
          `${field}.contrastingPersonaIds`,
          JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
        );

  return {
    stepId: requireString(
      input.stepId,
      `${field}.stepId`,
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
    ),
    summary: requireString(
      input.summary,
      `${field}.summary`,
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
    ),
    supportingPersonaIds,
    ...(contrastingPersonaIds === null ? {} : { contrastingPersonaIds }),
  };
}

function normalizeAnalysis(input) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
      "analysis must be an object.",
    );
  }

  return {
    opportunities: normalizeStringArray(
      input.opportunities,
      "analysis.opportunities",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
    ),
    differences: normalizeStringArray(
      input.differences,
      "analysis.differences",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_SYNTHESIS_RESULT,
    ),
  };
}

function normalizeBilling(input) {
  if (!input || typeof input !== "object") {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
      "billing must be an object.",
      502,
    );
  }

  if (!Array.isArray(input.actionBreakdown)) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
      "billing.actionBreakdown must be an array.",
      502,
    );
  }

  return {
    chargedCredits: requireNonNegativeInteger(
      input.chargedCredits,
      "billing.chargedCredits",
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
      502,
    ),
    actionBreakdown: input.actionBreakdown.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw createJourneyProtocolError(
          JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
          `billing.actionBreakdown[${index}] must be an object.`,
          502,
        );
      }

      return {
        actionKey: requireString(
          entry.actionKey,
          `billing.actionBreakdown[${index}].actionKey`,
          JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
          502,
        ),
        credits: requireNonNegativeInteger(
          entry.credits,
          `billing.actionBreakdown[${index}].credits`,
          JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
          502,
        ),
      };
    }),
  };
}

function normalizeModelSummary(input) {
  if (!Array.isArray(input)) {
    throw createJourneyProtocolError(
      JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
      "modelSummary must be an array.",
      502,
    );
  }

  return input.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw createJourneyProtocolError(
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
        `modelSummary[${index}] must be an object.`,
        502,
      );
    }

    return {
      providerKey: requireString(
        entry.providerKey,
        `modelSummary[${index}].providerKey`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
        502,
      ),
      modelKey: requireString(
        entry.modelKey,
        `modelSummary[${index}].modelKey`,
        JOURNEY_GENERATION_PROTOCOL_ERROR_CODES.INVALID_JOURNEY_GENERATION_RESPONSE,
        502,
      ),
    };
  });
}

function requireString(value, field, code, status = 400) {
  if (typeof value !== "string" || !value.trim()) {
    throw createJourneyProtocolError(code, `${field} is required.`, status);
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStringArray(input, field, code, status = 400) {
  if (!Array.isArray(input)) {
    throw createJourneyProtocolError(code, `${field} must be an array.`, status);
  }
  return input.map((entry, index) => requireString(entry, `${field}[${index}]`, code, status));
}

function requirePositiveInteger(value, field, code, status = 400) {
  if (!Number.isInteger(value) || value < 1) {
    throw createJourneyProtocolError(code, `${field} must be a positive integer.`, status);
  }
  return value;
}

function requireNonNegativeInteger(value, field, code, status = 400) {
  if (!Number.isInteger(value) || value < 0) {
    throw createJourneyProtocolError(code, `${field} must be a non-negative integer.`, status);
  }
  return value;
}

function assertUniqueIds(values, message, code) {
  if (new Set(values).size !== values.length) {
    throw createJourneyProtocolError(code, message);
  }
}

function sameOrderedValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createJourneyProtocolError(code, message, status = 400) {
  return new JourneyGenerationProtocolError(code, message, status);
}

module.exports = {
  JOURNEY_GENERATION_PROTOCOL_ERROR_CODES,
  JOURNEY_GENERATION_REQUEST_SOURCES,
  JOURNEY_SYNTHESIS_ROW_KEYS,
  JourneyGenerationProtocolError,
  normalizeJourneyGenerationRequest,
  normalizeJourneyGenerationResponse,
  normalizeJourneySkeleton,
  normalizeJourneySynthesisResult,
  normalizePersonaRunResult,
};
