const {
  buildIdempotencyKey,
  buildReferenceId,
  BillingError,
} = require("../billing/index.cjs");
const {
  JourneyGenerationProtocolError,
  normalizeJourneyGenerationRequest,
  normalizeJourneyGenerationResponse,
  normalizeJourneySkeleton,
  normalizeJourneySynthesisResult,
  normalizePersonaRunResult,
} = require("./protocol.cjs");
const {
  createJourneySkeletonGenerator,
} = require("./skeleton-generator.cjs");
const {
  createJourneyPersonaRunner,
} = require("./persona-runner.cjs");
const {
  createJourneySynthesizer,
} = require("./synthesizer.cjs");

const JOURNEY_TOOL_KEY = "journey-map";
const JOURNEY_TIER_KEY = "standard";

const ACTION_KEYS = Object.freeze({
  SKELETON_GENERATE: "skeleton_generate",
  PERSONA_RUN: "persona_run",
  JOURNEY_SYNTHESIS: "journey_synthesis",
});

const JOURNEY_GENERATION_ERROR_CODES = Object.freeze({
  JOURNEY_REQUEST_INVALID: "JOURNEY_REQUEST_INVALID",
  JOURNEY_ACCESS_DENIED: "JOURNEY_ACCESS_DENIED",
  JOURNEY_PERSONA_UNAVAILABLE: "JOURNEY_PERSONA_UNAVAILABLE",
  JOURNEY_BILLING_ACTION_UNAVAILABLE: "JOURNEY_BILLING_ACTION_UNAVAILABLE",
  JOURNEY_MODEL_POLICY_UNAVAILABLE: "JOURNEY_MODEL_POLICY_UNAVAILABLE",
  JOURNEY_MODEL_CALL_FAILED: "JOURNEY_MODEL_CALL_FAILED",
  JOURNEY_MODEL_OUTPUT_INVALID: "JOURNEY_MODEL_OUTPUT_INVALID",
  JOURNEY_DOCUMENT_SAVE_FAILED: "JOURNEY_DOCUMENT_SAVE_FAILED",
});

class JourneyGenerationServiceError extends Error {
  constructor(code, message, status = 400, cause = null) {
    super(message);
    this.name = "JourneyGenerationServiceError";
    this.code = code;
    this.status = status;
    if (cause) this.cause = cause;
  }
}

function createJourneyGenerationService({
  personaService,
  billingService,
  billingConfigService,
  skeletonGenerator,
  personaRunner,
  synthesizer,
  saveJourneyResult,
  invokeAction,
  createRunId = defaultCreateRunId,
} = {}) {
  if (!personaService?.getPersonaInputs) {
    throw new Error("Journey generation service requires personaService.getPersonaInputs().");
  }
  if (!billingService?.reserveCredits || !billingService?.commitCredits || !billingService?.releaseCredits) {
    throw new Error("Journey generation service requires billing reserve/commit/release support.");
  }
  if (!billingConfigService?.listAiActionPricing || !billingConfigService?.listAiModelPolicies) {
    throw new Error("Journey generation service requires billing config pricing and policy access.");
  }
  if (typeof saveJourneyResult !== "function") {
    throw new Error("Journey generation service requires saveJourneyResult().");
  }

  const resolvedSkeletonGenerator =
    skeletonGenerator || createJourneySkeletonGenerator({ invokeAction });
  const resolvedPersonaRunner =
    personaRunner || createJourneyPersonaRunner({ invokeAction });
  const resolvedSynthesizer =
    synthesizer || createJourneySynthesizer({ invokeAction });

  return {
    async generateJourney(input, options = {}) {
      const user = requireUser(options.user);
      const request = normalizeRequestOrThrow(input);
      const runId = createRunId();
      const referenceId = buildReferenceId({ scope: "ai_run", id: runId });
      const releaseStack = [];

      try {
        const personas = await resolvePersonaInputs({
          personaService,
          request,
          user,
        });
        const actionPlan = await resolveJourneyActionPlan({
          billingConfigService,
          request,
          user,
          personaCount: personas.length,
        });

        await reserveJourneyCredits({
          billingService,
          releaseStack,
          referenceId,
          runId,
          user,
          actionPlan,
        });

        const skeleton = normalizeGeneratorOutput(
          await resolvedSkeletonGenerator.generate({
            runId,
            user,
            request,
            personas,
            actionKey: ACTION_KEYS.SKELETON_GENERATE,
            modelPolicy: actionPlan[ACTION_KEYS.SKELETON_GENERATE].modelPolicy,
            actionPricing: actionPlan[ACTION_KEYS.SKELETON_GENERATE].actionPricing,
          }),
          "skeleton",
          normalizeJourneySkeleton,
        );

        const runResults = await runPersonas({
          personaRunner: resolvedPersonaRunner,
          runId,
          user,
          request,
          personas,
          skeleton,
          actionPlan,
        });

        const synthesisResult = normalizeGeneratorOutput(
          await resolvedSynthesizer.synthesize({
            runId,
            user,
            request,
            personas,
            skeleton,
            runResults,
            actionKey: ACTION_KEYS.JOURNEY_SYNTHESIS,
            modelPolicy: actionPlan[ACTION_KEYS.JOURNEY_SYNTHESIS].modelPolicy,
            actionPricing: actionPlan[ACTION_KEYS.JOURNEY_SYNTHESIS].actionPricing,
          }),
          "synthesis",
          normalizeJourneySynthesisResult,
        );

        const saved = await saveJourneyResultOrThrow({
          saveJourneyResult,
          runId,
          user,
          request,
          personas,
          skeleton,
          runResults,
          result: synthesisResult,
          billing: buildBillingSummary(actionPlan),
          modelSummary: collectModelSummary(actionPlan),
        });

        await commitJourneyCredits({
          billingService,
          releaseStack,
          referenceId,
          actionPlan,
        });

        return normalizeJourneyGenerationResponse({
          runId,
          documentId: saved.documentId,
          revision: saved.revision,
          result: synthesisResult,
          billing: buildBillingSummary(actionPlan),
          modelSummary: collectModelSummary(actionPlan),
        });
      } catch (error) {
        await releaseJourneyCredits({
          billingService,
          releaseStack,
          referenceId,
          error,
        });
        throw mapJourneyError(error);
      }
    },
  };
}

function requireUser(user) {
  if (!user?.id) {
    throw new JourneyGenerationServiceError(
      JOURNEY_GENERATION_ERROR_CODES.JOURNEY_ACCESS_DENIED,
      "A signed-in user is required for journey generation.",
      401,
    );
  }
  return user;
}

function normalizeRequestOrThrow(input) {
  try {
    return normalizeJourneyGenerationRequest(input);
  } catch (error) {
    if (error instanceof JourneyGenerationProtocolError) {
      throw new JourneyGenerationServiceError(
        JOURNEY_GENERATION_ERROR_CODES.JOURNEY_REQUEST_INVALID,
        error.message,
        error.status || 400,
        error,
      );
    }
    throw error;
  }
}

async function resolvePersonaInputs({ personaService, request, user }) {
  try {
    const result = await personaService.getPersonaInputs({
      userId: user.id,
      projectId: request.projectId,
      personaIds: request.personaIds,
    });
    return Array.isArray(result?.personas) ? result.personas : [];
  } catch (error) {
    const detail = error?.code ? `${error.code}: ${error.message}` : error?.message || String(error);
    throw new JourneyGenerationServiceError(
      JOURNEY_GENERATION_ERROR_CODES.JOURNEY_PERSONA_UNAVAILABLE,
      `Persona inputs are unavailable. ${detail}`,
      error?.status || 400,
      error,
    );
  }
}

async function resolveJourneyActionPlan({
  billingConfigService,
  request,
  user,
  personaCount,
}) {
  return {
    [ACTION_KEYS.SKELETON_GENERATE]: await resolveJourneyActionConfig({
      billingConfigService,
      request,
      user,
      actionKey: ACTION_KEYS.SKELETON_GENERATE,
      multiplier: 1,
    }),
    [ACTION_KEYS.PERSONA_RUN]: await resolveJourneyActionConfig({
      billingConfigService,
      request,
      user,
      actionKey: ACTION_KEYS.PERSONA_RUN,
      multiplier: personaCount,
    }),
    [ACTION_KEYS.JOURNEY_SYNTHESIS]: await resolveJourneyActionConfig({
      billingConfigService,
      request,
      user,
      actionKey: ACTION_KEYS.JOURNEY_SYNTHESIS,
      multiplier: 1,
    }),
  };
}

async function resolveJourneyActionConfig({
  billingConfigService,
  request,
  user,
  actionKey,
  multiplier,
}) {
  const actionPricingResult = await billingConfigService.listAiActionPricing({
    user,
    toolKey: JOURNEY_TOOL_KEY,
    actionKey,
    tierKey: JOURNEY_TIER_KEY,
    enabled: true,
    limit: 1,
    offset: 0,
  });
  const actionPricing = actionPricingResult?.items?.[0] || null;
  if (!actionPricing) {
    throw new JourneyGenerationServiceError(
      JOURNEY_GENERATION_ERROR_CODES.JOURNEY_BILLING_ACTION_UNAVAILABLE,
      `Journey billing action pricing is unavailable for "${actionKey}".`,
      409,
    );
  }

  const modelPolicyResult = await billingConfigService.listAiModelPolicies({
    user,
    toolKey: JOURNEY_TOOL_KEY,
    actionKey,
    enabled: true,
    limit: 1,
    offset: 0,
  });
  const modelPolicy = modelPolicyResult?.items?.[0] || null;
  if (!modelPolicy) {
    throw new JourneyGenerationServiceError(
      JOURNEY_GENERATION_ERROR_CODES.JOURNEY_MODEL_POLICY_UNAVAILABLE,
      `Journey model policy is unavailable for "${actionKey}".`,
      409,
    );
  }

  return {
    actionKey,
    actionPricing,
    modelPolicy,
    multiplier,
    credits: actionPricing.creditCost * multiplier,
  };
}

async function reserveJourneyCredits({
  billingService,
  releaseStack,
  referenceId,
  runId,
  user,
  actionPlan,
}) {
  for (const actionKey of [
    ACTION_KEYS.SKELETON_GENERATE,
    ACTION_KEYS.PERSONA_RUN,
    ACTION_KEYS.JOURNEY_SYNTHESIS,
  ]) {
    const entry = actionPlan[actionKey];
    const reservationResult = await billingService.reserveCredits({
      accountId: user.id,
      referenceId,
      toolKey: JOURNEY_TOOL_KEY,
      actionKey,
      tierKey: JOURNEY_TIER_KEY,
      credits: entry.credits,
      idempotencyKey: buildIdempotencyKey({
        scope: "credit.reserve",
        referenceId,
        requestId: `${runId}.${actionKey}`,
      }),
      metadata: {
        runId,
        actionKey,
        multiplier: entry.multiplier,
      },
    });

    releaseStack.push({
      actionKey,
      reservationId: reservationResult.reservation.id,
      state: "reserved",
    });
  }
}

async function commitJourneyCredits({
  billingService,
  releaseStack,
  referenceId,
  actionPlan,
}) {
  for (const reservation of releaseStack) {
    if (reservation.state !== "reserved") continue;
    await billingService.commitCredits({
      reservationId: reservation.reservationId,
      referenceId,
      idempotencyKey: buildIdempotencyKey({
        scope: "credit.commit",
        referenceId,
        requestId: reservation.actionKey,
      }),
      metadata: {
        actionKey: reservation.actionKey,
        credits: actionPlan[reservation.actionKey]?.credits || 0,
      },
    });
    reservation.state = "committed";
  }
}

async function releaseJourneyCredits({
  billingService,
  releaseStack,
  referenceId,
  error,
}) {
  for (let index = releaseStack.length - 1; index >= 0; index -= 1) {
    const reservation = releaseStack[index];
    if (reservation.state !== "reserved") continue;
    await billingService.releaseCredits({
      reservationId: reservation.reservationId,
      referenceId,
      idempotencyKey: buildIdempotencyKey({
        scope: "credit.release",
        referenceId,
        requestId: `${reservation.actionKey}.failure`,
      }),
      metadata: {
        actionKey: reservation.actionKey,
        error: error?.message || String(error),
      },
    }).catch(() => null);
    reservation.state = "released";
  }
}

async function runPersonas({
  personaRunner,
  runId,
  user,
  request,
  personas,
  skeleton,
  actionPlan,
}) {
  const runResults = [];
  for (const persona of personas) {
    const result = normalizeGeneratorOutput(
      await personaRunner.run({
        runId,
        user,
        request,
        persona,
        skeleton,
        actionKey: ACTION_KEYS.PERSONA_RUN,
        modelPolicy: actionPlan[ACTION_KEYS.PERSONA_RUN].modelPolicy,
        actionPricing: actionPlan[ACTION_KEYS.PERSONA_RUN].actionPricing,
      }),
      `persona:${persona.personaId}`,
      (output) => normalizePersonaRunResult(output, skeleton),
    );
    runResults.push(result);
  }
  return runResults;
}

function normalizeGeneratorOutput(output, label, normalize) {
  try {
    return normalize(output);
  } catch (error) {
    if (error instanceof JourneyGenerationProtocolError) {
      throw new JourneyGenerationServiceError(
        JOURNEY_GENERATION_ERROR_CODES.JOURNEY_MODEL_OUTPUT_INVALID,
        `Journey ${label} output is invalid. ${error.message}`,
        502,
        error,
      );
    }
    throw error;
  }
}

async function saveJourneyResultOrThrow(input) {
  try {
    const saved = await input.saveJourneyResult({
      runId: input.runId,
      user: input.user,
      request: input.request,
      personas: input.personas,
      skeleton: input.skeleton,
      runResults: input.runResults,
      result: input.result,
      billing: input.billing,
      modelSummary: input.modelSummary,
    });

    return {
      documentId: requireString(saved?.documentId, "documentId"),
      revision: requirePositiveInteger(saved?.revision, "revision"),
    };
  } catch (error) {
    if (error instanceof JourneyGenerationServiceError) throw error;
    throw new JourneyGenerationServiceError(
      JOURNEY_GENERATION_ERROR_CODES.JOURNEY_DOCUMENT_SAVE_FAILED,
      `Journey result could not be saved. ${error?.message || String(error)}`,
      error?.status || 500,
      error,
    );
  }
}

function buildBillingSummary(actionPlan) {
  const actionBreakdown = [
    ACTION_KEYS.SKELETON_GENERATE,
    ACTION_KEYS.PERSONA_RUN,
    ACTION_KEYS.JOURNEY_SYNTHESIS,
  ].map((actionKey) => ({
    actionKey,
    credits: actionPlan[actionKey].credits,
  }));

  return {
    chargedCredits: actionBreakdown.reduce((sum, entry) => sum + entry.credits, 0),
    actionBreakdown,
  };
}

function collectModelSummary(actionPlan) {
  const seen = new Set();
  const summary = [];
  for (const actionKey of [
    ACTION_KEYS.SKELETON_GENERATE,
    ACTION_KEYS.PERSONA_RUN,
    ACTION_KEYS.JOURNEY_SYNTHESIS,
  ]) {
    const policy = actionPlan[actionKey].modelPolicy;
    const providerKey = requireString(policy?.providerKey || policy?.provider, "providerKey");
    const modelKey = requireString(policy?.modelKey || policy?.model, "modelKey");
    const cacheKey = `${providerKey}:${modelKey}`;
    if (seen.has(cacheKey)) continue;
    seen.add(cacheKey);
    summary.push({ providerKey, modelKey });
  }
  return summary;
}

function mapJourneyError(error) {
  if (error instanceof JourneyGenerationServiceError) {
    return error;
  }
  if (error instanceof JourneyGenerationProtocolError) {
    return new JourneyGenerationServiceError(
      JOURNEY_GENERATION_ERROR_CODES.JOURNEY_MODEL_OUTPUT_INVALID,
      error.message,
      error.status || 502,
      error,
    );
  }
  if (error instanceof BillingError) {
    return new JourneyGenerationServiceError(
      JOURNEY_GENERATION_ERROR_CODES.JOURNEY_MODEL_CALL_FAILED,
      error.message,
      error.status || 409,
      error,
    );
  }
  return new JourneyGenerationServiceError(
    JOURNEY_GENERATION_ERROR_CODES.JOURNEY_MODEL_CALL_FAILED,
    error?.message || String(error),
    error?.status || 500,
    error,
  );
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value;
}

function defaultCreateRunId() {
  return `journey-run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

module.exports = {
  ACTION_KEYS,
  JOURNEY_GENERATION_ERROR_CODES,
  JOURNEY_TIER_KEY,
  JOURNEY_TOOL_KEY,
  JourneyGenerationServiceError,
  collectModelSummary,
  createJourneyGenerationService,
  buildBillingSummary,
};
