export type JourneySidebarState = {
  showSceneInputs: boolean;
  showAssistantPanel: boolean;
  assistantStatus: "ready" | "pending";
};

export function resolveJourneySidebarState(input: {
  hasDocumentContext: boolean;
}): JourneySidebarState {
  return {
    showSceneInputs: false,
    showAssistantPanel: true,
    assistantStatus: input.hasDocumentContext ? "ready" : "pending",
  };
}
