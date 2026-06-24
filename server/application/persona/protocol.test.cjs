const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PERSONA_READ_ERROR_CODES,
  PersonaReadError,
  assertPersonaAccessAllowed,
  assertPersonaDocumentExists,
  assertPersonaProjectMatch,
  normalizeGetPersonaInputsParams,
} = require("./protocol.cjs");

test("protocol exposes the complete persona read error code set", () => {
  assert.deepEqual(PERSONA_READ_ERROR_CODES, {
    PERSONA_IDS_EMPTY: "PERSONA_IDS_EMPTY",
    PERSONA_DUPLICATED_IDS: "PERSONA_DUPLICATED_IDS",
    PERSONA_NOT_FOUND: "PERSONA_NOT_FOUND",
    PERSONA_PROJECT_MISMATCH: "PERSONA_PROJECT_MISMATCH",
    PERSONA_ACCESS_DENIED: "PERSONA_ACCESS_DENIED",
    PERSONA_DOCUMENT_INVALID: "PERSONA_DOCUMENT_INVALID",
    PERSONA_INPUT_TOO_LARGE: "PERSONA_INPUT_TOO_LARGE",
  });
});

test("normalizeGetPersonaInputsParams rejects empty personaIds", () => {
  assert.throws(
    () =>
      normalizeGetPersonaInputsParams({
        userId: "user-1",
        projectId: "project-1",
        personaIds: [],
      }),
    (error) =>
      error instanceof PersonaReadError &&
      error.code === PERSONA_READ_ERROR_CODES.PERSONA_IDS_EMPTY,
  );
});

test("normalizeGetPersonaInputsParams rejects duplicated persona ids", () => {
  assert.throws(
    () =>
      normalizeGetPersonaInputsParams({
        userId: "user-1",
        projectId: "project-1",
        personaIds: ["persona-1", "persona-1"],
      }),
    (error) =>
      error instanceof PersonaReadError &&
      error.code === PERSONA_READ_ERROR_CODES.PERSONA_DUPLICATED_IDS,
  );
});

test("normalizeGetPersonaInputsParams trims and preserves valid request fields", () => {
  const normalized = normalizeGetPersonaInputsParams({
    userId: " user-1 ",
    projectId: " project-1 ",
    personaIds: [" persona-1 ", "persona-2"],
  });

  assert.deepEqual(normalized, {
    userId: "user-1",
    projectId: "project-1",
    personaIds: ["persona-1", "persona-2"],
  });
});

test("assertPersonaDocumentExists raises PERSONA_NOT_FOUND", () => {
  assert.throws(
    () => assertPersonaDocumentExists(null, "persona-1"),
    (error) =>
      error instanceof PersonaReadError &&
      error.code === PERSONA_READ_ERROR_CODES.PERSONA_NOT_FOUND,
  );
});

test("assertPersonaProjectMatch raises PERSONA_PROJECT_MISMATCH", () => {
  assert.throws(
    () => assertPersonaProjectMatch("project-1", "project-2", "persona-1"),
    (error) =>
      error instanceof PersonaReadError &&
      error.code === PERSONA_READ_ERROR_CODES.PERSONA_PROJECT_MISMATCH,
  );
});

test("assertPersonaAccessAllowed raises PERSONA_ACCESS_DENIED", () => {
  assert.throws(
    () => assertPersonaAccessAllowed(false, "persona-1"),
    (error) =>
      error instanceof PersonaReadError &&
      error.code === PERSONA_READ_ERROR_CODES.PERSONA_ACCESS_DENIED,
  );
});
