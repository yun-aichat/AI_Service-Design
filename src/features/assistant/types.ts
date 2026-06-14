import type { JourneyProposal } from "../../tools/journey-map"
import type { AssistantPhase } from "./protocol"

export type AssistantFeedback = "like" | "dislike"

export type AssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  image?: string
  phase?: AssistantPhase
  questions?: string[]
  proposal?: JourneyProposal
}
