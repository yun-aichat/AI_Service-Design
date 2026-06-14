const fs = require("node:fs");
const path = require("node:path");

const SKILL_FILES = Object.freeze({
  "journey-map-editor": {
    prompt: ["skills", "journey-map-editor", "SKILL.md"],
    schema: ["skills", "journey-map-editor", "references", "response-schema.md"],
  },
});

function readAssistantSkill(skillId, rootDir = process.cwd()) {
  const entry = SKILL_FILES[skillId];
  if (!entry) {
    throw new Error(`Unsupported assistant skill "${skillId}".`);
  }

  const prompt = fs.readFileSync(path.join(rootDir, ...entry.prompt), "utf8");
  const schema = fs.readFileSync(path.join(rootDir, ...entry.schema), "utf8");
  return `${prompt}\n\n${schema}`;
}

module.exports = {
  readAssistantSkill,
};
