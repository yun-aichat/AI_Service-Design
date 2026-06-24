const {
  PersonaReadError,
  PERSONA_READ_ERROR_CODES,
  assertPersonaAccessAllowed,
  assertPersonaDocumentExists,
  assertPersonaProjectMatch,
  createPersonaDocumentInvalidError,
  normalizeGetPersonaInputsParams,
  requireString,
} = require("./protocol.cjs");
const {
  mapPersonaDocumentToResolvedPersonaInput,
} = require("./mapping.cjs");

function createPersonaService({ toolDocumentService } = {}) {
  if (!toolDocumentService || typeof toolDocumentService.readDocument !== "function") {
    throw new Error("Persona service requires toolDocumentService.readDocument().");
  }

  async function readPersonaDocument(input) {
    const userId = requireString(input?.userId, "userId");
    const projectId = requireString(input?.projectId, "projectId");
    const personaId = requireString(input?.personaId, "personaId");

    const document = await readPersonaToolDocument({
      toolDocumentService,
      userId,
      personaId,
    });

    assertPersonaProjectMatch(projectId, document.projectId, personaId);

    if (document.toolId !== "persona") {
      throw createPersonaDocumentInvalidError(
        `Document "${personaId}" is not a persona tool document.`,
      );
    }

    if (!document.content || typeof document.content !== "object") {
      throw createPersonaDocumentInvalidError(
        `Persona "${personaId}" content must be an object.`,
      );
    }

    return document.content;
  }

  async function getPersonaInputs(input) {
    const params = normalizeGetPersonaInputsParams(input);
    const personas = [];

    for (const personaId of params.personaIds) {
      const personaDocument = await readPersonaDocument({
        userId: params.userId,
        projectId: params.projectId,
        personaId,
      });

      personas.push(
        mapPersonaDocumentToResolvedPersonaInput({
          projectId: params.projectId,
          personaDocument,
        }),
      );
    }

    return { personas };
  }

  return {
    getPersonaInputs,
    readPersonaDocument,
  };
}

async function readPersonaToolDocument({
  toolDocumentService,
  userId,
  personaId,
}) {
  try {
    const document = await toolDocumentService.readDocument({
      user: { id: userId },
      documentId: personaId,
    });
    return assertPersonaDocumentExists(document, personaId);
  } catch (error) {
    if (error?.code === "DOCUMENT_NOT_FOUND") {
      assertPersonaDocumentExists(null, personaId);
    }
    if (error?.code === "FORBIDDEN" || error?.code === "UNAUTHENTICATED") {
      assertPersonaAccessAllowed(false, personaId);
    }
    if (error instanceof PersonaReadError) {
      throw error;
    }
    throw error;
  }
}

module.exports = {
  PERSONA_READ_ERROR_CODES,
  createPersonaService,
};
