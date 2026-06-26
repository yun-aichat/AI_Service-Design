const { ASSISTANT_USAGE_EVENT } = require("./protocol.cjs");

const DEFAULT_ASSISTANT_ACTION_KEY = "proposal";
const DEFAULT_ASSISTANT_TIER_KEY = "standard";

const BILLING_STATUS = Object.freeze({
  CHARGED: "charged",
  NOT_CHARGED: "not_charged",
});

function createNoopAssistantUsageRecorder() {
  return {
    async recordGenerated() {
      return null;
    },
  };
}

function createToolDocumentAssistantUsageRecorder({
  toolDocumentService,
  billingConfigService,
} = {}) {
  const hasToolDocumentWriter = Boolean(toolDocumentService?.recordUsageEvent);

  if (!hasToolDocumentWriter && !billingConfigService?.recordAiUsageEvent) {
    return createNoopAssistantUsageRecorder();
  }

  return {
    async recordGenerated({
      request,
      response,
      user,
      model,
      usage = null,
      runId = null,
      error = null,
      chargedCredits = 0,
    }) {
      if (!user?.id || !request?.document?.documentId || !request?.document?.projectId) {
        return null;
      }

      const inputTokens =
        usage && typeof usage.inputTokens === "number" ? usage.inputTokens : null;
      const outputTokens =
        usage && typeof usage.outputTokens === "number" ? usage.outputTokens : null;
      const totalTokens =
        usage && typeof usage.totalTokens === "number"
          ? usage.totalTokens
          : inputTokens !== null && outputTokens !== null
            ? inputTokens + outputTokens
            : null;
      const responsePhase = response ? response.phase || null : null;
      const usageKeys = resolveUsageKeys(request);
      const status = resolveBillingEventStatus(error, responsePhase);
      const billingStatus = resolveBillingResult(status, chargedCredits);
      const settledCredits = status === "succeeded" ? chargedCredits : 0;

      let toolResult = null;
      if (hasToolDocumentWriter) {
        try {
          toolResult = await toolDocumentService.recordUsageEvent({
            user,
            projectId: request.document.projectId,
            documentId: request.document.documentId,
            toolId: request.toolId,
            eventType: ASSISTANT_USAGE_EVENT,
            revision: request.document.revision,
            metadata: {
              assistantSkillId: request.skillId,
              assistantSkillVersion: request.skillVersion,
              responsePhase,
              usageCandidate: request.context?.usageEventCandidate || null,
              messageCount: request.messages?.length || 0,
              attachmentCount: (request.messages || []).reduce(
                (count, message) => count + (message.attachments?.length || 0),
                0,
              ),
              model,
              toolKey: usageKeys.toolKey,
              actionKey: usageKeys.actionKey,
              inputTokens,
              outputTokens,
              totalTokens,
              runId: runId || null,
              error: error || null,
              status,
              billingStatus,
              chargedCredits: settledCredits,
            },
          });
        } catch {}
      }

      if (billingConfigService?.recordAiUsageEvent) {
        let provider = "unknown";
        try {
          const result = await billingConfigService.listAiModelPolicies({
            user: { id: "system" },
            toolKey: usageKeys.toolKey,
            actionKey: usageKeys.actionKey,

            enabled: true,
            limit: 1,
          });
          provider = result?.items?.[0]?.provider || provider;
        } catch {}

        try {
          await billingConfigService.recordAiUsageEvent({
            record: {
              userId: user.id,
              projectId: request.document.projectId,
              documentId: request.document.documentId,
              toolKey: usageKeys.toolKey,
              actionKey: usageKeys.actionKey,
              tierKey: usageKeys.tierKey,
              provider,
              model: model || "unknown",
              inputTokens,
              outputTokens,
              totalTokens,
              estimatedCostValue: null,
              chargedCredits: settledCredits,
              status,
              billingStatus,
              referenceId: runId || "unknown",
            },
          });
        } catch {}
      }

      return toolResult;
    },
  };
}

function resolveBillingEventStatus(error, responsePhase) {
  if (error) return "failed";
  if (responsePhase === "clarify") return "cancelled";
  if (responsePhase === "proposal" || responsePhase === "message") return "succeeded";
  return "failed";
}

function resolveBillingResult(status, chargedCredits) {
  if (status === "succeeded" && chargedCredits > 0) return BILLING_STATUS.CHARGED;
  return BILLING_STATUS.NOT_CHARGED;
}

function resolveUsageKeys(request) {
  const toolKey =
    request?.toolKey ||
    request?.toolId ||
    request?.document?.toolId ||
    null;
  const actionKey =
    request?.actionKey ||
    (request?.context?.usageEventCandidate === ASSISTANT_USAGE_EVENT
      ? DEFAULT_ASSISTANT_ACTION_KEY
      : null);
  const tierKey = request?.tierKey || DEFAULT_ASSISTANT_TIER_KEY;

  return {
    toolKey,
    actionKey,
    tierKey,
  };
}

module.exports = {
  BILLING_STATUS,
  DEFAULT_ASSISTANT_ACTION_KEY,
  DEFAULT_ASSISTANT_TIER_KEY,
  createNoopAssistantUsageRecorder,
  createToolDocumentAssistantUsageRecorder,
  resolveBillingEventStatus,
  resolveBillingResult,
  resolveUsageKeys,
};
