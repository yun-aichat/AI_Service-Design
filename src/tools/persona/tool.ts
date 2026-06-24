import {
  type CreateToolDocumentInput,
  type ToolCommand,
  type ToolDefinition,
  ToolRuntimeError,
} from "../../domain/tool-runtime"

export type PersonaConfidence = "low" | "medium" | "high"
export type PersonaFit = "high" | "medium" | "low"
export type PersonaPlacement = "in_persona" | "pool"
export type PersonaInsightKind = "behavior" | "context"
export type PersonaSummaryKind = "need" | "preference" | "avoidance"
export type TraitLevel = 1 | 2 | 3 | 4 | 5

export type EvidenceSourceKind = "imported_file" | "manual_note"

export type EvidenceItem = {
  id: string
  sourceKind: EvidenceSourceKind
  sourceLabel: string
  quote: string
  speakerLabel?: string
  importedAt?: string
  createdAt: string
  tags: string[]
  linkedInsightIds: string[]
}

export type InsightCard = {
  id: string
  kind: PersonaInsightKind
  summary: string
  semanticTags: string[]
  evidenceIds: string[]
  sourceLabels: string[]
  sampleSize: number
  confidence: PersonaConfidence
  fit: PersonaFit
  placement: PersonaPlacement
}

export type PersonaTrait = {
  suggested: TraitLevel
  confirmed?: TraitLevel
  confidence: PersonaConfidence
  rationale: string
  supportingInsightIds: string[]
}

export type PersonaTraitSet = {
  patienceTolerance: PersonaTrait
  riskTolerance: PersonaTrait
  autonomy: PersonaTrait
  trustTendency: PersonaTrait
}

export type PersonaProfile = {
  name: string
  age?: number
  avatarUrl?: string
  occupation?: string
  city?: string
  incomeBand?: string
  familyBackground?: string
  educationBackground?: string
  roleTags: string[]
}

export type PersonaSummaryItem = {
  id: string
  kind: PersonaSummaryKind
  text: string
  confidence: PersonaConfidence
  supportingInsightIds: string[]
  confirmed: boolean
}

export type PersonaSkeleton = {
  id: string
  segmentName: string
  summary: string
  seedInsightIds: string[]
}

export type PersonaDocument = {
  id: string
  skeleton: PersonaSkeleton
  profile: PersonaProfile
  evidenceItems: EvidenceItem[]
  behaviorInsights: InsightCard[]
  contextInsights: InsightCard[]
  traits: PersonaTraitSet
  summaryItems: PersonaSummaryItem[]
  meta: {
    version: number
    createdAt: string
    updatedAt: string
  }
}

export type PersonaCommand = ToolCommand<
  "persona.replace-document",
  { document: unknown }
>

const PERSONA_TOOL_ID = "persona"
const PERSONA_DOCUMENT_VERSION = 1
const CONFIDENCE_VALUES = ["low", "medium", "high"] as const
const FIT_VALUES = ["high", "medium", "low"] as const
const PLACEMENT_VALUES = ["in_persona", "pool"] as const
const SUMMARY_KIND_VALUES = ["need", "preference", "avoidance"] as const
const INSIGHT_KIND_VALUES = ["behavior", "context"] as const
const EVIDENCE_SOURCE_KIND_VALUES = ["imported_file", "manual_note"] as const
const TRAIT_LEVEL_VALUES = [1, 2, 3, 4, 5] as const

export function createInitialPersonaDocument(
  _input: unknown,
  context: Readonly<CreateToolDocumentInput>,
): PersonaDocument {
  return {
    id: context.id,
    skeleton: {
      id: context.id,
      segmentName: "",
      summary: "",
      seedInsightIds: [],
    },
    profile: {
      name: "",
      roleTags: [],
    },
    evidenceItems: [],
    behaviorInsights: [],
    contextInsights: [],
    traits: {
      patienceTolerance: createInitialTrait(),
      riskTolerance: createInitialTrait(),
      autonomy: createInitialTrait(),
      trustTendency: createInitialTrait(),
    },
    summaryItems: [],
    meta: {
      version: PERSONA_DOCUMENT_VERSION,
      createdAt: context.now,
      updatedAt: context.now,
    },
  }
}

function createInitialTrait(): PersonaTrait {
  return {
    suggested: 3,
    confidence: "low",
    rationale: "",
    supportingInsightIds: [],
  }
}

export function validatePersonaDocument(input: unknown): PersonaDocument {
  const candidate = requireRecord(input, "personaDocument")

  return {
    id: requireString(candidate.id, "id"),
    skeleton: validatePersonaSkeleton(candidate.skeleton, "skeleton"),
    profile: validatePersonaProfile(candidate.profile, "profile"),
    evidenceItems: requireArray(candidate.evidenceItems, "evidenceItems").map(
      (entry, index) => validateEvidenceItem(entry, `evidenceItems[${index}]`),
    ),
    behaviorInsights: requireArray(
      candidate.behaviorInsights,
      "behaviorInsights",
    ).map((entry, index) =>
      validateInsightCard(entry, `behaviorInsights[${index}]`, "behavior"),
    ),
    contextInsights: requireArray(
      candidate.contextInsights,
      "contextInsights",
    ).map((entry, index) =>
      validateInsightCard(entry, `contextInsights[${index}]`, "context"),
    ),
    traits: validatePersonaTraitSet(candidate.traits, "traits"),
    summaryItems: requireArray(candidate.summaryItems, "summaryItems").map(
      (entry, index) =>
        validatePersonaSummaryItem(entry, `summaryItems[${index}]`),
    ),
    meta: validateMeta(candidate.meta, "meta"),
  }
}

function validatePersonaSkeleton(input: unknown, path: string): PersonaSkeleton {
  const candidate = requireRecord(input, path)
  return {
    id: requireString(candidate.id, `${path}.id`),
    segmentName: requireString(candidate.segmentName, `${path}.segmentName`, true),
    summary: requireString(candidate.summary, `${path}.summary`, true),
    seedInsightIds: requireStringArray(candidate.seedInsightIds, `${path}.seedInsightIds`),
  }
}

function validatePersonaProfile(input: unknown, path: string): PersonaProfile {
  const candidate = requireRecord(input, path)
  const age = requireOptionalInteger(candidate.age, `${path}.age`)
  const avatarUrl = requireOptionalString(candidate.avatarUrl, `${path}.avatarUrl`)
  const occupation = requireOptionalString(candidate.occupation, `${path}.occupation`)
  const city = requireOptionalString(candidate.city, `${path}.city`)
  const incomeBand = requireOptionalString(candidate.incomeBand, `${path}.incomeBand`)
  const familyBackground = requireOptionalString(
    candidate.familyBackground,
    `${path}.familyBackground`,
  )
  const educationBackground = requireOptionalString(
    candidate.educationBackground,
    `${path}.educationBackground`,
  )

  return {
    name: requireString(candidate.name, `${path}.name`, true),
    ...(age === undefined ? {} : { age }),
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
    ...(occupation === undefined ? {} : { occupation }),
    ...(city === undefined ? {} : { city }),
    ...(incomeBand === undefined ? {} : { incomeBand }),
    ...(familyBackground === undefined ? {} : { familyBackground }),
    ...(educationBackground === undefined ? {} : { educationBackground }),
    roleTags: requireStringArray(candidate.roleTags, `${path}.roleTags`),
  }
}

function validateEvidenceItem(input: unknown, path: string): EvidenceItem {
  const candidate = requireRecord(input, path)
  const speakerLabel = requireOptionalString(candidate.speakerLabel, `${path}.speakerLabel`)
  const importedAt = requireOptionalString(candidate.importedAt, `${path}.importedAt`)

  return {
    id: requireString(candidate.id, `${path}.id`),
    sourceKind: requireEnum(
      candidate.sourceKind,
      EVIDENCE_SOURCE_KIND_VALUES,
      `${path}.sourceKind`,
    ),
    sourceLabel: requireString(candidate.sourceLabel, `${path}.sourceLabel`),
    quote: requireString(candidate.quote, `${path}.quote`, true),
    ...(speakerLabel === undefined ? {} : { speakerLabel }),
    ...(importedAt === undefined ? {} : { importedAt }),
    createdAt: requireString(candidate.createdAt, `${path}.createdAt`),
    tags: requireStringArray(candidate.tags, `${path}.tags`),
    linkedInsightIds: requireStringArray(
      candidate.linkedInsightIds,
      `${path}.linkedInsightIds`,
    ),
  }
}

function validateInsightCard(
  input: unknown,
  path: string,
  expectedKind: PersonaInsightKind,
): InsightCard {
  const candidate = requireRecord(input, path)
  return {
    id: requireString(candidate.id, `${path}.id`),
    kind: requireExpectedEnum(
      candidate.kind,
      INSIGHT_KIND_VALUES,
      expectedKind,
      `${path}.kind`,
    ),
    summary: requireString(candidate.summary, `${path}.summary`, true),
    semanticTags: requireStringArray(candidate.semanticTags, `${path}.semanticTags`),
    evidenceIds: requireStringArray(candidate.evidenceIds, `${path}.evidenceIds`),
    sourceLabels: requireStringArray(candidate.sourceLabels, `${path}.sourceLabels`),
    sampleSize: requireNonNegativeInteger(candidate.sampleSize, `${path}.sampleSize`),
    confidence: requireEnum(candidate.confidence, CONFIDENCE_VALUES, `${path}.confidence`),
    fit: requireEnum(candidate.fit, FIT_VALUES, `${path}.fit`),
    placement: requireEnum(candidate.placement, PLACEMENT_VALUES, `${path}.placement`),
  }
}

function validatePersonaTraitSet(input: unknown, path: string): PersonaTraitSet {
  const candidate = requireRecord(input, path)
  return {
    patienceTolerance: validatePersonaTrait(
      candidate.patienceTolerance,
      `${path}.patienceTolerance`,
    ),
    riskTolerance: validatePersonaTrait(candidate.riskTolerance, `${path}.riskTolerance`),
    autonomy: validatePersonaTrait(candidate.autonomy, `${path}.autonomy`),
    trustTendency: validatePersonaTrait(candidate.trustTendency, `${path}.trustTendency`),
  }
}

function validatePersonaTrait(input: unknown, path: string): PersonaTrait {
  const candidate = requireRecord(input, path)
  const confirmed = requireOptionalTraitLevel(candidate.confirmed, `${path}.confirmed`)
  return {
    suggested: requireTraitLevel(candidate.suggested, `${path}.suggested`),
    ...(confirmed === undefined ? {} : { confirmed }),
    confidence: requireEnum(candidate.confidence, CONFIDENCE_VALUES, `${path}.confidence`),
    rationale: requireString(candidate.rationale, `${path}.rationale`, true),
    supportingInsightIds: requireStringArray(
      candidate.supportingInsightIds,
      `${path}.supportingInsightIds`,
    ),
  }
}

function validatePersonaSummaryItem(
  input: unknown,
  path: string,
): PersonaSummaryItem {
  const candidate = requireRecord(input, path)
  return {
    id: requireString(candidate.id, `${path}.id`),
    kind: requireEnum(candidate.kind, SUMMARY_KIND_VALUES, `${path}.kind`),
    text: requireString(candidate.text, `${path}.text`, true),
    confidence: requireEnum(candidate.confidence, CONFIDENCE_VALUES, `${path}.confidence`),
    supportingInsightIds: requireStringArray(
      candidate.supportingInsightIds,
      `${path}.supportingInsightIds`,
    ),
    confirmed: requireBoolean(candidate.confirmed, `${path}.confirmed`),
  }
}

function validateMeta(
  input: unknown,
  path: string,
): PersonaDocument["meta"] {
  const candidate = requireRecord(input, path)
  return {
    version: requirePositiveInteger(candidate.version, `${path}.version`),
    createdAt: requireString(candidate.createdAt, `${path}.createdAt`),
    updatedAt: requireString(candidate.updatedAt, `${path}.updatedAt`),
  }
}

function requireRecord(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${path} must be an object.`)
  }
  return input as Record<string, unknown>
}

function requireArray(input: unknown, path: string): unknown[] {
  if (!Array.isArray(input)) {
    throw new Error(`${path} must be an array.`)
  }
  return input
}

function requireString(
  input: unknown,
  path: string,
  allowEmpty = false,
): string {
  if (typeof input !== "string") {
    throw new Error(`${path} must be a string.`)
  }

  if (!allowEmpty && !input.trim()) {
    throw new Error(`${path} must be a non-empty string.`)
  }

  return allowEmpty ? input : input.trim()
}

function requireOptionalString(input: unknown, path: string): string | undefined {
  if (input === undefined) return undefined
  return requireString(input, path, true)
}

function requireStringArray(input: unknown, path: string): string[] {
  return requireArray(input, path).map((entry, index) =>
    requireString(entry, `${path}[${index}]`, true),
  )
}

function requireOptionalInteger(input: unknown, path: string): number | undefined {
  if (input === undefined) return undefined
  if (!Number.isInteger(input)) {
    throw new Error(`${path} must be an integer.`)
  }
  return input as number
}

function requireNonNegativeInteger(input: unknown, path: string): number {
  if (!Number.isInteger(input) || (input as number) < 0) {
    throw new Error(`${path} must be a non-negative integer.`)
  }
  return input as number
}

function requirePositiveInteger(input: unknown, path: string): number {
  if (!Number.isInteger(input) || (input as number) < 1) {
    throw new Error(`${path} must be a positive integer.`)
  }
  return input as number
}

function requireBoolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw new Error(`${path} must be a boolean.`)
  }
  return input
}

function requireTraitLevel(input: unknown, path: string): TraitLevel {
  if (!TRAIT_LEVEL_VALUES.includes(input as TraitLevel)) {
    throw new Error(`${path} must be one of 1, 2, 3, 4, 5.`)
  }
  return input as TraitLevel
}

function requireOptionalTraitLevel(
  input: unknown,
  path: string,
): TraitLevel | undefined {
  if (input === undefined) return undefined
  return requireTraitLevel(input, path)
}

function requireEnum<TValue extends string>(
  input: unknown,
  values: readonly TValue[],
  path: string,
): TValue {
  if (typeof input !== "string" || !values.includes(input as TValue)) {
    throw new Error(`${path} must be one of: ${values.join(", ")}.`)
  }
  return input as TValue
}

function requireExpectedEnum<TValue extends string>(
  input: unknown,
  values: readonly TValue[],
  expected: TValue,
  path: string,
): TValue {
  const actual = requireEnum(input, values, path)
  if (actual !== expected) {
    throw new Error(`${path} must be ${expected}.`)
  }
  return actual
}

export const personaToolDefinition: ToolDefinition<
  PersonaDocument,
  PersonaCommand
> = {
  metadata: {
    id: PERSONA_TOOL_ID,
    name: "Persona",
    description: "Persona 正式资产宿主，保存四层画像协议与洞察摘要。",
    category: "service-design",
    tags: ["persona", "service-design"],
    inputKinds: ["text"],
    outputKinds: [],
  },
  documentVersion: PERSONA_DOCUMENT_VERSION,
  createInitialDocument(input: unknown, context: Readonly<CreateToolDocumentInput>) {
    if (input !== undefined) {
      return validatePersonaDocument(input)
    }
    return createInitialPersonaDocument(input, context)
  },
  validateDocument(input: unknown) {
    return validatePersonaDocument(input)
  },
  applyCommand(_document: Readonly<PersonaDocument>, command: PersonaCommand) {
    if (command.type !== "persona.replace-document") {
      throw new ToolRuntimeError(
        "INVALID_DEFINITION",
        `Unsupported persona command \"${command.type}\".`,
      )
    }

    return validatePersonaDocument(command.payload.document)
  },
  migrations: [],
  exports: [],
}
