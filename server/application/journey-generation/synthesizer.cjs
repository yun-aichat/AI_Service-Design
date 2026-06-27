const {
  normalizeJourneySynthesisResult,
} = require("./protocol.cjs");

function createJourneySynthesizer({ invokeAction } = {}) {
  if (typeof invokeAction !== "function") {
    throw new Error("Journey synthesizer requires invokeAction().");
  }

  return {
    async synthesize(input) {
      const output = await invokeAction({
        ...input,
        actionKey: input?.actionKey || "journey_synthesis",
      });
      return normalizeJourneySynthesisResult(output);
    },
  };
}

module.exports = {
  createJourneySynthesizer,
};
