const {
  normalizeJourneySkeleton,
} = require("./protocol.cjs");

function createJourneySkeletonGenerator({ invokeAction } = {}) {
  if (typeof invokeAction !== "function") {
    throw new Error("Journey skeleton generator requires invokeAction().");
  }

  return {
    async generate(input) {
      const output = await invokeAction({
        ...input,
        actionKey: input?.actionKey || "skeleton_generate",
      });
      return normalizeJourneySkeleton(output);
    },
  };
}

module.exports = {
  createJourneySkeletonGenerator,
};
