import type { JourneyMap, JourneyProposal } from "../../tools/journey-map"

export const ASSISTANT_SCOPE_TOOL = "tool"
export const JOURNEY_ASSISTANT_TOOL_ID = "journey-map"
export const JOURNEY_ASSISTANT_SKILL_ID = "journey-map-editor"
export const JOURNEY_ASSISTANT_SKILL_VERSION = "1.0.0"
export const JOURNEY_ASSISTANT_USAGE_EVENT = "ai_generated"

export type AssistantPhase = "clarify" | "proposal" | "message"
export type AssistantRole = "user" | "assistant"

export type AssistantAttachment = {
  id: string
  kind: "image"
  mimeType: string | null
  dataUrl: string
}

export type AssistantConversationMessage = {
  id: string
  role: AssistantRole
  content: string
  attachments?: AssistantAttachment[]
}

export type AssistantToolDocument<TDocument> = {
  toolId: string
  documentId?: string | null
  projectId?: string | null
  schemaVersion: number
  revision?: number | null
  title: string
  content: TDocument
}

export type AssistantToolContext<TDocument> = {
  scope: typeof ASSISTANT_SCOPE_TOOL
  toolId: string
  skillId: string
  skillVersion: string
  document: AssistantToolDocument<TDocument>
  context: {
    serviceName: string
    toolName: string
    toolContext: TDocument
    usageEventCandidate?: string | null
  }
  messages: AssistantConversationMessage[]
}

export type JourneyAssistantRequest = AssistantToolContext<JourneyMap>

export type JourneyAssistantMessageResponse = {
  phase: "message"
  message: string
}

export type JourneyAssistantClarifyResponse = {
  phase: "clarify"
  message: string
  questions: string[]
}

export type JourneyAssistantProposalResponse = {
  phase: "proposal"
  message: string
  proposal: JourneyProposal
}

export type JourneyAssistantResponse =
  | JourneyAssistantMessageResponse
  | JourneyAssistantClarifyResponse
  | JourneyAssistantProposalResponse
