const PERSONA_READ_ERROR_CODES = Object.freeze({
  PERSONA_IDS_EMPTY: "PERSONA_IDS_EMPTY",
  PERSONA_DUPLICATED_IDS: "PERSONA_DUPLICATED_IDS",
  PERSONA_NOT_FOUND: "PERSONA_NOT_FOUND",
  PERSONA_PROJECT_MISMATCH: "PERSONA_PROJECT_MISMATCH",
  PERSONA_ACCESS_DENIED: "PERSONA_ACCESS_DENIED",
  PERSONA_DOCUMENT_INVALID: "PERSONA_DOCUMENT_INVALID",
  PERSONA_INPUT_TOO_LARGE: "PERSONA_INPUT_TOO_LARGE",
});

const SOFT_PERSONA_INPUT_LIMIT = 3500;
const HARD_PERSONA_INPUT_LIMIT = 5000;

const ERROR_STATUS_BY_CODE = Object.freeze({
  [PERSONA_READ_ERROR_CODES.PERSONA_IDS_EMPTY]: 400,
  [PERSONA_READ_ERROR_CODES.PERSONA_DUPLICATED_IDS]: 400,
  [PERSONA_READ_ERROR_CODES.PERSONA_NOT_FOUND]: 404,
  [PERSONA_READ_ERROR_CODES.PERSONA_PROJECT_MISMATCH]: 400,
  [PERSONA_READ_ERROR_CODES.PERSONA_ACCESS_DENIED]: 403,
  [PERSONA_READ_ERROR_CODES.PERSONA_DOCUMENT_INVALID]: 422,
  [PERSONA_READ_ERROR_CODES.PERSONA_INPUT_TOO_LARGE]: 422,
});

class PersonaReadError extends Error {
  constructor(code, message, status = ERROR_STATUS_BY_CODE[code] || 400) {
    super(message);
    this.name = "PersonaReadError";
    this.code = code;
    this.status = status;
  }
}

function normalizeGetPersonaInputsParams(input) {
  if (!input || typeof input !== "object") {
    throw new PersonaReadError(
      PERSONA_READ_ERROR_CODES.PERSONA_DOCUMENT_INVALID,
      "Persona input params must be an object.",
    );
  }

  return {
    userId: requireString(input.userId, "userId"),
    projectId: requireString(input.projectId, "projectId"),
    personaIds: normalizePersonaIds(input.personaIds),
  };
}

function normalizePersonaIds(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new PersonaReadError(
      PERSONA_READ_ERROR_CODES.PERSONA_IDS_EMPTY,
      "personaIds must contain at least one persona id.",
    );
  }

  const personaIds = input.map((value, index) =>
    requireString(value, `personaIds[${index}]`),
  );
  if (new Set(personaIds).size !== personaIds.length) {
    throw new PersonaReadError(
      PERSONA_READ_ERROR_CODES.PERSONA_DUPLICATED_IDS,
      "personaIds contains duplicated ids.",
    );
  }

  return personaIds;
}

function assertPersonaDocumentExists(document, personaId) {
  if (document) return document;
  throw new PersonaReadError(
    PERSONA_READ_ERROR_CODES.PERSONA_NOT_FOUND,
    `Persona "${personaId}" was not found.`,
  );
}

function assertPersonaProjectMatch(expectedProjectId, actualProjectId, personaId) {
  if (expectedProjectId === actualProjectId) return true;
  throw new PersonaReadError(
    PERSONA_READ_ERROR_CODES.PERSONA_PROJECT_MISMATCH,
    `Persona "${personaId}" does not belong to project "${expectedProjectId}".`,
  );
}

function assertPersonaAccessAllowed(hasAccess, personaId) {
  if (hasAccess) return true;
  throw new PersonaReadError(
    PERSONA_READ_ERROR_CODES.PERSONA_ACCESS_DENIED,
    `Access denied for persona "${personaId}".`,
  );
}

function createPersonaDocumentInvalidError(message) {
  return new PersonaReadError(
    PERSONA_READ_ERROR_CODES.PERSONA_DOCUMENT_INVALID,
    message,
  );
}

function createPersonaInputTooLargeError(personaId, length) {
  return new PersonaReadError(
    PERSONA_READ_ERROR_CODES.PERSONA_INPUT_TOO_LARGE,
    `Persona "${personaId}" exceeds the hard input limit: ${length} characters.`,
  );
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw createPersonaDocumentInvalidError(`${field} is required.`);
  }
  return value.trim();
}

function requireIntegerInRange(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw createPersonaDocumentInvalidError(
      `${field} must be an integer between ${min} and ${max}.`,
    );
  }
  return value;
}

module.exports = {
  HARD_PERSONA_INPUT_LIMIT,
  PERSONA_READ_ERROR_CODES,
  SOFT_PERSONA_INPUT_LIMIT,
  PersonaReadError,
  assertPersonaAccessAllowed,
  assertPersonaDocumentExists,
  assertPersonaProjectMatch,
  createPersonaDocumentInvalidError,
  createPersonaInputTooLargeError,
  normalizeGetPersonaInputsParams,
  requireIntegerInRange,
  requireString,
};
