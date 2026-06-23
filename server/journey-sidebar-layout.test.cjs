const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveJourneySidebarState,
} = require("../.plugin-staging/journey-layout-tests/tools/journey-map/sidebar-layout.js");

test("journey sidebar only exposes assistant chat in the current layout", () => {
  assert.deepEqual(resolveJourneySidebarState({ hasDocumentContext: true }), {
    showSceneInputs: false,
    showAssistantPanel: true,
    assistantStatus: "ready",
  });
});

test("journey sidebar keeps assistant visible while document context is preparing", () => {
  assert.deepEqual(resolveJourneySidebarState({ hasDocumentContext: false }), {
    showSceneInputs: false,
    showAssistantPanel: true,
    assistantStatus: "pending",
  });
});
