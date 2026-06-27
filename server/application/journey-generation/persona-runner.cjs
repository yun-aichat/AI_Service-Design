const {
  normalizePersonaRunResult,
} = require("./protocol.cjs");

function createJourneyPersonaRunner({ invokeAction } = {}) {
  if (typeof invokeAction !== "function") {
    throw new Error("Journey persona runner requires invokeAction().");
  }

  return {
    async run(input) {
      const output = await invokeAction({
        ...input,
        actionKey: input?.actionKey || "persona_run",
      });
      return normalizePersonaRunResult(output, input.skeleton);
    },
  };
}

module.exports = {
  createJourneyPersonaRunner,
};
