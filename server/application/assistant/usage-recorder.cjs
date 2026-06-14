const { ASSISTANT_USAGE_EVENT } = require("./protocol.cjs");

function createNoopAssistantUsageRecorder() {
  return {
    async recordGenerated() {
      return null;
    },
  };
}

function createToolDocumentAssistantUsageRecorder({ toolDocumentService } = {}) {
  if (!toolDocumentService?.recordUsageEvent) {
    return createNoopAssistantUsageRecorder();
  }

  return {
    async recordGenerated({ request, response, user, model }) {
      if (!user?.id || !request?.document?.documentId || !request?.document?.projectId) {
        return null;
      }

      return toolDocumentService.recordUsageEvent({
        user,
        projectId: request.document.projectId,
        documentId: request.document.documentId,
        toolId: request.toolId,
        eventType: ASSISTANT_USAGE_EVENT,
        revision: request.document.revision,
        metadata: {
          assistantSkillId: request.skillId,
          assistantSkillVersion: request.skillVersion,
          responsePhase: response.phase,
          usageCandidate: request.context.usageEventCandidate,
          messageCount: request.messages.length,
          attachmentCount: request.messages.reduce(
            (count, message) => count + (message.attachments?.length || 0),
            0,
          ),
          model,
        },
      });
    },
  };
}

module.exports = {
  createNoopAssistantUsageRecorder,
  createToolDocumentAssistantUsageRecorder,
};
