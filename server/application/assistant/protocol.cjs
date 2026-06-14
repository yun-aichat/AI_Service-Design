const ASSISTANT_RESPONSE_PHASES = Object.freeze([
  "message",
  "clarify",
  "proposal",
]);

const ASSISTANT_TOOL_SCOPE = "tool";
const ASSISTANT_USAGE_EVENT = "ai_generated";
const JOURNEY_ASSISTANT_TOOL_ID = "journey-map";
const JOURNEY_ASSISTANT_SKILL_ID = "journey-map-editor";

class AssistantProtocolError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "AssistantProtocolError";
    this.code = code;
    this.status = status;
  }
}

function normalizeAssistantRequest(input) {
  if (!input || typeof input !== "object") {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_REQUEST",
      "Assistant request must be an object.",
    );
  }

  const scope = requireString(input.scope, "scope");
  if (scope !== ASSISTANT_TOOL_SCOPE) {
    throw new AssistantProtocolError(
      "UNSUPPORTED_ASSISTANT_SCOPE",
      `Unsupported assistant scope "${scope}".`,
    );
  }

  const toolId = requireString(input.toolId, "toolId");
  const skillId = requireString(input.skillId, "skillId");
  const skillVersion = requireString(input.skillVersion, "skillVersion");
  const document = normalizeDocument(input.document, toolId);
  const context = normalizeContext(input.context, document.content);
  const messages = normalizeMessages(input.messages);

  return {
    scope,
    toolId,
    skillId,
    skillVersion,
    document,
    context,
    messages,
  };
}

function normalizeAssistantResponse(input) {
  if (!input || typeof input !== "object") {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_RESPONSE",
      "Assistant response must be an object.",
      502,
    );
  }

  const phase = requireString(input.phase, "phase");
  if (!ASSISTANT_RESPONSE_PHASES.includes(phase)) {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_PHASE",
      `Unknown assistant phase "${phase}".`,
      502,
    );
  }

  const message = requireString(input.message, "message");
  if (phase === "clarify") {
    if (!Array.isArray(input.questions) || input.questions.length === 0) {
      throw new AssistantProtocolError(
        "INVALID_ASSISTANT_RESPONSE",
        "Clarify response must include questions.",
        502,
      );
    }
    return {
      phase,
      message,
      questions: input.questions.map((entry, index) =>
        requireString(entry, `questions[${index}]`),
      ),
    };
  }

  if (phase === "proposal") {
    if (!input.proposal || typeof input.proposal !== "object") {
      throw new AssistantProtocolError(
        "INVALID_ASSISTANT_RESPONSE",
        "Proposal response must include proposal.",
        502,
      );
    }
    const summary = Array.isArray(input.proposal.summary)
      ? input.proposal.summary.map((entry, index) =>
          requireString(entry, `proposal.summary[${index}]`),
        )
      : null;
    if (!summary || !input.proposal.journey || typeof input.proposal.journey !== "object") {
      throw new AssistantProtocolError(
        "INVALID_ASSISTANT_RESPONSE",
        "Proposal response is missing journey content.",
        502,
      );
    }
    return {
      phase,
      message,
      proposal: {
        summary,
        journey: input.proposal.journey,
      },
    };
  }

  return {
    phase,
    message,
  };
}

function parseAssistantModelResponse(content) {
  const text = String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_JSON",
      `Assistant model did not return valid JSON: ${error.message}`,
      502,
    );
  }
  return normalizeAssistantResponse(parsed);
}

function normalizeDocument(input, toolId) {
  if (!input || typeof input !== "object") {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_DOCUMENT",
      "Assistant request requires a document context.",
    );
  }

  const documentToolId = requireString(input.toolId, "document.toolId");
  if (documentToolId !== toolId) {
    throw new AssistantProtocolError(
      "ASSISTANT_DOCUMENT_TOOL_MISMATCH",
      "Assistant document toolId must match request toolId.",
    );
  }

  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_DOCUMENT",
      "document.schemaVersion must be a positive integer.",
    );
  }

  if (!input.content || typeof input.content !== "object") {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_DOCUMENT",
      "document.content must be an object.",
    );
  }

  return {
    toolId: documentToolId,
    documentId: normalizeOptionalString(input.documentId),
    projectId: normalizeOptionalString(input.projectId),
    schemaVersion: input.schemaVersion,
    revision:
      typeof input.revision === "number" && Number.isInteger(input.revision)
        ? input.revision
        : null,
    title: requireString(input.title, "document.title"),
    content: input.content,
  };
}

function normalizeContext(input, fallbackToolContext) {
  if (!input || typeof input !== "object") {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_CONTEXT",
      "Assistant request requires tool context.",
    );
  }

  return {
    serviceName: requireString(input.serviceName, "context.serviceName"),
    toolName: requireString(input.toolName, "context.toolName"),
    toolContext:
      input.toolContext && typeof input.toolContext === "object"
        ? input.toolContext
        : fallbackToolContext,
    usageEventCandidate:
      normalizeOptionalString(input.usageEventCandidate) || ASSISTANT_USAGE_EVENT,
  };
}

function normalizeMessages(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_MESSAGES",
      "Assistant request requires messages.",
    );
  }

  return input.slice(-20).map((message, index) => {
    if (!message || typeof message !== "object") {
      throw new AssistantProtocolError(
        "INVALID_ASSISTANT_MESSAGE",
        `messages[${index}] must be an object.`,
      );
    }
    const role = requireString(message.role, `messages[${index}].role`);
    if (!["user", "assistant"].includes(role)) {
      throw new AssistantProtocolError(
        "INVALID_ASSISTANT_MESSAGE",
        `messages[${index}].role is invalid.`,
      );
    }

    return {
      id: normalizeOptionalString(message.id) || `message-${index + 1}`,
      role,
      content: typeof message.content === "string" ? message.content : "",
      attachments: normalizeAttachments(message.attachments, index),
    };
  });
}

function normalizeAttachments(input, messageIndex) {
  if (!Array.isArray(input) || input.length === 0) return [];
  return input
    .filter(Boolean)
    .map((attachment, attachmentIndex) => {
      if (!attachment || typeof attachment !== "object") {
        throw new AssistantProtocolError(
          "INVALID_ASSISTANT_ATTACHMENT",
          `messages[${messageIndex}].attachments[${attachmentIndex}] must be an object.`,
        );
      }
      const kind = requireString(
        attachment.kind,
        `messages[${messageIndex}].attachments[${attachmentIndex}].kind`,
      );
      if (kind !== "image") {
        throw new AssistantProtocolError(
          "INVALID_ASSISTANT_ATTACHMENT",
          "Only image attachments are currently supported.",
        );
      }
      return {
        id:
          normalizeOptionalString(attachment.id) ||
          `attachment-${messageIndex + 1}-${attachmentIndex + 1}`,
        kind,
        mimeType: normalizeOptionalString(attachment.mimeType),
        dataUrl: requireString(
          attachment.dataUrl,
          `messages[${messageIndex}].attachments[${attachmentIndex}].dataUrl`,
        ),
      };
    });
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AssistantProtocolError(
      "INVALID_ASSISTANT_FIELD",
      `${field} is required.`,
    );
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

module.exports = {
  ASSISTANT_RESPONSE_PHASES,
  ASSISTANT_TOOL_SCOPE,
  ASSISTANT_USAGE_EVENT,
  AssistantProtocolError,
  JOURNEY_ASSISTANT_SKILL_ID,
  JOURNEY_ASSISTANT_TOOL_ID,
  normalizeAssistantRequest,
  normalizeAssistantResponse,
  parseAssistantModelResponse,
};
