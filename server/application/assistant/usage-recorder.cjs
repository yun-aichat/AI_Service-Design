const { ASSISTANT_USAGE_EVENT } = require("./protocol.cjs");

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
              toolKey: request.toolKey || null,
              actionKey: request.actionKey || null,
              tierKey: request.tierKey || null,
              inputTokens,
              outputTokens,
              totalTokens,
              runId: runId || null,
              error: error || null,
            },
          });
        } catch {}
      }

      if (billingConfigService?.recordAiUsageEvent) {
        let provider = "unknown";
        try {
          const result = await billingConfigService.listAiModelPolicies({
            user: { id: "system" },
            toolKey: request.toolKey,
            actionKey: request.actionKey,
            tierKey: request.tierKey,
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
              toolKey: request.toolKey,
              actionKey: request.actionKey,
              tierKey: request.tierKey,
              provider,
              model: model || "unknown",
              inputTokens,
              outputTokens,
              totalTokens,
              estimatedCostValue: null,
              chargedCredits: 0,
              status: error ? "failed" : "succeeded",
              referenceId: runId || "unknown",
            },
          });
        } catch {}
      }

      return toolResult;
    },
  };
}

module.exports = {
  createNoopAssistantUsageRecorder,
  createToolDocumentAssistantUsageRecorder,
};
