const {
  HARD_PERSONA_INPUT_LIMIT,
  SOFT_PERSONA_INPUT_LIMIT,
  createPersonaDocumentInvalidError,
  createPersonaInputTooLargeError,
  requireIntegerInRange,
  requireString,
} = require("./protocol.cjs");

const TRAIT_KEYS = Object.freeze([
  "patienceTolerance",
  "riskTolerance",
  "autonomy",
  "trustTendency",
]);

const SUMMARY_KIND_TO_FIELD = Object.freeze({
  need: "needs",
  preference: "preferences",
  avoidance: "avoidances",
});

function mapPersonaDocumentToResolvedPersonaInput(input) {
  const projectId = requireString(input?.projectId, "projectId");
  const personaDocument = normalizePersonaDocument(input?.personaDocument);
  const resolvedInput = {
    personaId: personaDocument.id,
    projectId,
    segmentName: personaDocument.skeleton.segmentName,
    profileName: personaDocument.profile.name,
    oneLineSummary: personaDocument.skeleton.summary,
    roleTags: personaDocument.profile.roleTags.slice(),
    baseProfile: buildBaseProfile(personaDocument.profile),
    traits: buildTraits(personaDocument.traits),
    needs: [],
    preferences: [],
    avoidances: [],
    behaviorSummaries: collectInsightSummaries(personaDocument.behaviorInsights, "behavior"),
    contextSummaries: collectInsightSummaries(personaDocument.contextInsights, "context"),
    sourceMeta: buildSourceMeta(personaDocument),
  };

  for (const item of personaDocument.summaryItems) {
    if (!item.confirmed) continue;
    resolvedInput[SUMMARY_KIND_TO_FIELD[item.kind]].push(item.text);
  }

  if (input?.applyLengthRules === false) {
    return resolvedInput;
  }

  return applyPersonaInputLengthRules(resolvedInput);
}

function applyPersonaInputLengthRules(input) {
  const rawLength = estimateResolvedPersonaInputLength(input);
  if (rawLength > HARD_PERSONA_INPUT_LIMIT) {
    throw createPersonaInputTooLargeError(input.personaId, rawLength);
  }
  if (rawLength <= SOFT_PERSONA_INPUT_LIMIT) {
    return input;
  }

  return compressResolvedPersonaInput(input, SOFT_PERSONA_INPUT_LIMIT);
}

function compressResolvedPersonaInput(input, limit) {
  const base = {
    ...input,
    behaviorSummaries: [],
    contextSummaries: [],
  };

  if (estimateResolvedPersonaInputLength(base) >= limit) {
    return base;
  }

  const queue = toRoundRobinSummaryQueue(input);
  if (queue.length === 0) {
    return base;
  }

  let low = 0;
  let high = Math.max(...queue.map((entry) => entry.value.length));
  let best = base;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = applySummaryLengthCap(base, queue, mid);
    if (estimateResolvedPersonaInputLength(candidate) <= limit) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function applySummaryLengthCap(base, queue, maxSummaryLength) {
  const candidate = {
    ...base,
    behaviorSummaries: [],
    contextSummaries: [],
  };

  for (const entry of queue) {
    candidate[entry.section].push(
      shortenText(entry.value.trim(), maxSummaryLength),
    );
  }

  return candidate;
}

function shortenText(value, maxLength) {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return "…";
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function toRoundRobinSummaryQueue(input) {
  const queue = [];
  const maxLength = Math.max(
    input.behaviorSummaries.length,
    input.contextSummaries.length,
  );

  for (let index = 0; index < maxLength; index += 1) {
    if (index < input.behaviorSummaries.length) {
      queue.push({
        section: "behaviorSummaries",
        value: input.behaviorSummaries[index],
      });
    }
    if (index < input.contextSummaries.length) {
      queue.push({
        section: "contextSummaries",
        value: input.contextSummaries[index],
      });
    }
  }

  return queue;
}

function collectInsightSummaries(insights, expectedKind) {
  return insights
    .filter((insight) => insight.kind === expectedKind && insight.placement === "in_persona")
    .map((insight) => insight.summary);
}

function buildTraits(traits) {
  if (!traits || typeof traits !== "object") {
    throw createPersonaDocumentInvalidError("traits is required.");
  }

  const resolved = {};
  for (const key of TRAIT_KEYS) {
    const trait = traits[key];
    if (!trait || typeof trait !== "object") {
      throw createPersonaDocumentInvalidError(`traits.${key} is required.`);
    }
    resolved[key] = requireIntegerInRange(
      trait.confirmed,
      `traits.${key}.confirmed`,
      1,
      5,
    );
  }

  return resolved;
}

function buildBaseProfile(profile) {
  const baseProfile = {};
  copyOptionalInteger(profile.age, "profile.age", baseProfile, "age");
  copyOptionalString(profile.occupation, baseProfile, "occupation");
  copyOptionalString(profile.city, baseProfile, "city");
  copyOptionalString(profile.incomeBand, baseProfile, "incomeBand");
  copyOptionalString(profile.familyBackground, baseProfile, "familyBackground");
  copyOptionalString(profile.educationBackground, baseProfile, "educationBackground");
  return baseProfile;
}

function copyOptionalInteger(value, field, target, key) {
  if (value == null) return;
  target[key] = requireIntegerInRange(value, field, 0, Number.MAX_SAFE_INTEGER);
}

function copyOptionalString(value, target, key) {
  if (value == null) return;
  target[key] = requireString(value, `profile.${key}`);
}

function buildSourceMeta(personaDocument) {
  const includedBehavior = personaDocument.behaviorInsights.filter(
    (insight) => insight.placement === "in_persona",
  );
  const includedContext = personaDocument.contextInsights.filter(
    (insight) => insight.placement === "in_persona",
  );
  const includedEvidenceIds = new Set();
  for (const insight of includedBehavior.concat(includedContext)) {
    for (const evidenceId of insight.evidenceIds) {
      includedEvidenceIds.add(evidenceId);
    }
  }

  let evidenceCount = 0;
  for (const item of personaDocument.evidenceItems) {
    if (includedEvidenceIds.has(item.id)) {
      evidenceCount += 1;
    }
  }

  return {
    behaviorInsightCount: includedBehavior.length,
    contextInsightCount: includedContext.length,
    evidenceCount,
    updatedAt: personaDocument.meta.updatedAt,
  };
}

function normalizePersonaDocument(document) {
  if (!document || typeof document !== "object") {
    throw createPersonaDocumentInvalidError("personaDocument must be an object.");
  }

  return {
    id: requireString(document.id, "personaDocument.id"),
    skeleton: normalizeSkeleton(document.skeleton),
    profile: normalizeProfile(document.profile),
    evidenceItems: normalizeEvidenceItems(document.evidenceItems),
    behaviorInsights: normalizeInsights(document.behaviorInsights, "behaviorInsights", "behavior"),
    contextInsights: normalizeInsights(document.contextInsights, "contextInsights", "context"),
    traits: document.traits,
    summaryItems: normalizeSummaryItems(document.summaryItems),
    meta: normalizeMeta(document.meta),
  };
}

function normalizeSkeleton(input) {
  if (!input || typeof input !== "object") {
    throw createPersonaDocumentInvalidError("skeleton is required.");
  }
  return {
    id: requireString(input.id, "skeleton.id"),
    segmentName: requireString(input.segmentName, "skeleton.segmentName"),
    summary: requireString(input.summary, "skeleton.summary"),
    seedInsightIds: normalizeStringArray(input.seedInsightIds, "skeleton.seedInsightIds"),
  };
}

function normalizeProfile(input) {
  if (!input || typeof input !== "object") {
    throw createPersonaDocumentInvalidError("profile is required.");
  }
  return {
    name: requireString(input.name, "profile.name"),
    age: input.age ?? null,
    avatarUrl: input.avatarUrl ?? null,
    occupation: input.occupation ?? null,
    city: input.city ?? null,
    incomeBand: input.incomeBand ?? null,
    familyBackground: input.familyBackground ?? null,
    educationBackground: input.educationBackground ?? null,
    roleTags: normalizeStringArray(input.roleTags, "profile.roleTags"),
  };
}

function normalizeEvidenceItems(input) {
  if (!Array.isArray(input)) {
    throw createPersonaDocumentInvalidError("evidenceItems must be an array.");
  }
  return input.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw createPersonaDocumentInvalidError(`evidenceItems[${index}] must be an object.`);
    }
    return {
      id: requireString(item.id, `evidenceItems[${index}].id`),
    };
  });
}

function normalizeInsights(input, field, expectedKind) {
  if (!Array.isArray(input)) {
    throw createPersonaDocumentInvalidError(`${field} must be an array.`);
  }
  return input.map((insight, index) => {
    if (!insight || typeof insight !== "object") {
      throw createPersonaDocumentInvalidError(`${field}[${index}] must be an object.`);
    }

    const kind = requireString(insight.kind, `${field}[${index}].kind`);
    if (kind !== expectedKind) {
      throw createPersonaDocumentInvalidError(
        `${field}[${index}].kind must be "${expectedKind}".`,
      );
    }

    const placement = requireString(insight.placement, `${field}[${index}].placement`);
    if (!["in_persona", "pool"].includes(placement)) {
      throw createPersonaDocumentInvalidError(
        `${field}[${index}].placement is invalid.`,
      );
    }

    return {
      id: requireString(insight.id, `${field}[${index}].id`),
      kind,
      summary: requireString(insight.summary, `${field}[${index}].summary`),
      evidenceIds: normalizeStringArray(insight.evidenceIds, `${field}[${index}].evidenceIds`),
      placement,
    };
  });
}

function normalizeSummaryItems(input) {
  if (!Array.isArray(input)) {
    throw createPersonaDocumentInvalidError("summaryItems must be an array.");
  }
  return input.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw createPersonaDocumentInvalidError(`summaryItems[${index}] must be an object.`);
    }

    const kind = requireString(item.kind, `summaryItems[${index}].kind`);
    if (!Object.hasOwn(SUMMARY_KIND_TO_FIELD, kind)) {
      throw createPersonaDocumentInvalidError(`summaryItems[${index}].kind is invalid.`);
    }
    if (typeof item.confirmed !== "boolean") {
      throw createPersonaDocumentInvalidError(
        `summaryItems[${index}].confirmed must be boolean.`,
      );
    }

    return {
      id: requireString(item.id, `summaryItems[${index}].id`),
      kind,
      text: requireString(item.text, `summaryItems[${index}].text`),
      confirmed: item.confirmed,
    };
  });
}

function normalizeMeta(input) {
  if (!input || typeof input !== "object") {
    throw createPersonaDocumentInvalidError("meta is required.");
  }
  return {
    updatedAt: requireString(input.updatedAt, "meta.updatedAt"),
  };
}

function normalizeStringArray(input, field) {
  if (!Array.isArray(input)) {
    throw createPersonaDocumentInvalidError(`${field} must be an array.`);
  }
  return input.map((value, index) => requireString(value, `${field}[${index}]`));
}

function renderResolvedPersonaInput(input) {
  return [
    `personaId: ${input.personaId}`,
    `projectId: ${input.projectId}`,
    `segmentName: ${input.segmentName}`,
    `profileName: ${input.profileName}`,
    `oneLineSummary: ${input.oneLineSummary}`,
    `roleTags: ${input.roleTags.join(" | ")}`,
    `baseProfile: ${renderObjectEntries(input.baseProfile)}`,
    `traits: ${renderObjectEntries(input.traits)}`,
    `needs: ${input.needs.join(" | ")}`,
    `preferences: ${input.preferences.join(" | ")}`,
    `avoidances: ${input.avoidances.join(" | ")}`,
    `behaviorSummaries: ${input.behaviorSummaries.join(" | ")}`,
    `contextSummaries: ${input.contextSummaries.join(" | ")}`,
    `sourceMeta: ${renderObjectEntries(input.sourceMeta)}`,
  ].join("\n");
}

function renderObjectEntries(object) {
  return Object.entries(object)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function estimateResolvedPersonaInputLength(input) {
  return renderResolvedPersonaInput(input).length;
}

module.exports = {
  estimateResolvedPersonaInputLength,
  mapPersonaDocumentToResolvedPersonaInput,
  renderResolvedPersonaInput,
};
