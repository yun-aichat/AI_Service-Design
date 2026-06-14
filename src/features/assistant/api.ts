import {
  JOURNEY_ASSISTANT_SKILL_ID,
  JOURNEY_ASSISTANT_SKILL_VERSION,
  JOURNEY_ASSISTANT_TOOL_ID,
  JOURNEY_ASSISTANT_USAGE_EVENT,
} from "./protocol"
import type {
  AssistantConversationMessage,
  JourneyAssistantRequest,
  JourneyAssistantResponse,
} from "./protocol"
import { getCloudBaseAuthPort } from "../../infrastructure/cloudbase/auth/cloudbase-auth-port"
import type { JourneyMap } from "../../tools/journey-map"
import type { AssistantMessage } from "./types"

function getDataUrlMimeType(value: string) {
  if (!value.startsWith("data:")) return null
  const delimiterIndex = value.indexOf(";")
  if (delimiterIndex < 5) return null
  return value.slice(5, delimiterIndex) || null
}

function toConversationMessage(
  message: AssistantMessage,
): AssistantConversationMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.image
      ? [
          {
            id: `${message.id}-image`,
            kind: "image",
            mimeType: getDataUrlMimeType(message.image),
            dataUrl: message.image,
          },
        ]
      : undefined,
  }
}

export function createJourneyAssistantRequest({
  serviceName,
  currentJourney,
  messages,
  documentId,
  projectId,
  revision,
}: {
  serviceName: string
  currentJourney: JourneyMap
  messages: AssistantMessage[]
  documentId: string
  projectId: string
  revision: number | null
}): JourneyAssistantRequest {
  return {
    scope: "tool",
    toolId: JOURNEY_ASSISTANT_TOOL_ID,
    skillId: JOURNEY_ASSISTANT_SKILL_ID,
    skillVersion: JOURNEY_ASSISTANT_SKILL_VERSION,
    document: {
      toolId: JOURNEY_ASSISTANT_TOOL_ID,
      documentId,
      projectId,
      schemaVersion: 1,
      revision,
      title: currentJourney.title,
      content: currentJourney,
    },
    context: {
      serviceName,
      toolName: "Journey Map",
      toolContext: currentJourney,
      usageEventCandidate: JOURNEY_ASSISTANT_USAGE_EVENT,
    },
    messages: messages.map(toConversationMessage),
  }
}

export async function requestJourneyAssistant(
  payload: {
    serviceName: string
    currentJourney: JourneyMap
    messages: AssistantMessage[]
    documentId: string
    projectId: string
    revision: number | null
  },
): Promise<JourneyAssistantResponse> {
  const token = await readAssistantAccessToken().catch(() => null)
  const response = await fetch("/api/journey-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(createJourneyAssistantRequest(payload)),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof result?.error === "string" ? result.error : "AI 服务请求失败",
    )
  }

  return result as JourneyAssistantResponse
}

async function readAssistantAccessToken() {
  const session = await getCloudBaseAuthPort().getSession()
  return session?.accessToken || null
}
