import {
  type CreateToolDocumentInput,
  type ToolCommand,
  type ToolCommandResult,
  type ToolDefinition,
  type ToolDocument,
  type ToolExportArtifact,
  type ToolExportRequest,
  ToolRuntimeError,
} from "../domain/tool-runtime"

export function createToolDocument<TContent, TCommand extends ToolCommand>(
  definition: ToolDefinition<TContent, TCommand>,
  input: CreateToolDocumentInput,
): ToolDocument<TContent> {
  assertToolDefinition(definition)

  const initialContent = definition.createInitialDocument(input.initialValue, input)
  const content = definition.validateDocument(initialContent)
  assertJsonSerializable(content)

  return {
    id: input.id,
    projectId: input.projectId,
    toolId: definition.metadata.id,
    schemaVersion: definition.documentVersion,
    revision: 0,
    title: input.title,
    content,
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function applyToolCommand<TContent, TCommand extends ToolCommand>(
  definition: ToolDefinition<TContent, TCommand>,
  document: Readonly<ToolDocument<TContent>>,
  command: TCommand,
  appliedAt: string,
): ToolCommandResult<TContent, TCommand> {
  assertDocumentCompatibility(definition, document)

  if (command.expectedRevision !== document.revision) {
    throw new ToolRuntimeError(
      "REVISION_CONFLICT",
      `Expected revision ${command.expectedRevision}, received ${document.revision}.`,
    )
  }

  const nextContent = definition.validateDocument(
    definition.applyCommand(document.content, command),
  )
  assertJsonSerializable(nextContent)

  return {
    document: {
      ...document,
      content: nextContent,
      revision: document.revision + 1,
      updatedAt: appliedAt,
    },
    command,
    previousRevision: document.revision,
    appliedAt,
  }
}

export function migrateToolDocument<TContent, TCommand extends ToolCommand>(
  definition: ToolDefinition<TContent, TCommand>,
  document: Readonly<ToolDocument<unknown>>,
  migratedAt: string,
): ToolDocument<TContent> {
  assertToolMatch(definition, document)
  assertToolDefinition(definition)

  if (document.schemaVersion > definition.documentVersion) {
    throw new ToolRuntimeError(
      "DOCUMENT_VERSION_AHEAD",
      `Document version ${document.schemaVersion} is newer than supported version ${definition.documentVersion}.`,
    )
  }

  let content: unknown = document.content
  let version = document.schemaVersion

  while (version < definition.documentVersion) {
    const migration = definition.migrations.find(
      (candidate) => candidate.fromVersion === version,
    )

    if (!migration || migration.toVersion <= version) {
      throw new ToolRuntimeError(
        "MIGRATION_NOT_FOUND",
        `No valid migration exists from version ${version} for tool "${definition.metadata.id}".`,
      )
    }

    content = migration.migrate(content)
    version = migration.toVersion
  }

  if (version !== definition.documentVersion) {
    throw new ToolRuntimeError(
      "MIGRATION_NOT_FOUND",
      `Migration chain ended at version ${version}, expected ${definition.documentVersion}.`,
    )
  }

  const migratedContent = definition.validateDocument(content)
  assertJsonSerializable(migratedContent)

  return {
    ...document,
    content: migratedContent,
    schemaVersion: version,
    updatedAt: migratedAt,
  }
}

export async function exportToolDocument<
  TContent,
  TCommand extends ToolCommand,
>(
  definition: ToolDefinition<TContent, TCommand>,
  document: Readonly<ToolDocument<TContent>>,
  request: ToolExportRequest,
): Promise<ToolExportArtifact> {
  assertDocumentCompatibility(definition, document)

  const adapter = definition.exports.find(
    (candidate) => candidate.format === request.format,
  )

  if (!adapter) {
    throw new ToolRuntimeError(
      "EXPORT_NOT_FOUND",
      `Export format "${request.format}" is not registered for tool "${definition.metadata.id}".`,
    )
  }

  return adapter.export(document, request)
}

export function assertToolDefinition<
  TContent,
  TCommand extends ToolCommand,
>(
  definition: ToolDefinition<TContent, TCommand>,
): void {
  if (
    typeof definition.metadata?.id !== "string" ||
    !definition.metadata.id.trim() ||
    !Number.isInteger(definition.documentVersion) ||
    definition.documentVersion < 1 ||
    typeof definition.createInitialDocument !== "function" ||
    typeof definition.validateDocument !== "function" ||
    typeof definition.applyCommand !== "function" ||
    !Array.isArray(definition.migrations) ||
    !Array.isArray(definition.exports)
  ) {
    throw new ToolRuntimeError(
      "INVALID_DEFINITION",
      "A tool definition requires a non-empty id and a positive integer document version.",
    )
  }

  const migrationStarts = new Set<number>()
  for (const migration of definition.migrations) {
    const isAdjacent =
      Number.isInteger(migration.fromVersion) &&
      Number.isInteger(migration.toVersion) &&
      migration.fromVersion >= 1 &&
      migration.toVersion === migration.fromVersion + 1

    if (
      !isAdjacent ||
      migration.toVersion > definition.documentVersion ||
      migrationStarts.has(migration.fromVersion) ||
      typeof migration.migrate !== "function"
    ) {
      throw new ToolRuntimeError(
        "INVALID_DEFINITION",
        `Tool "${definition.metadata.id}" has an invalid migration from ${migration.fromVersion} to ${migration.toVersion}.`,
      )
    }

    migrationStarts.add(migration.fromVersion)
  }

  const exportFormats = new Set<string>()
  for (const adapter of definition.exports) {
    if (
      typeof adapter.format !== "string" ||
      !adapter.format.trim() ||
      exportFormats.has(adapter.format) ||
      typeof adapter.export !== "function"
    ) {
      throw new ToolRuntimeError(
        "INVALID_DEFINITION",
        `Tool "${definition.metadata.id}" has an invalid or duplicate export format.`,
      )
    }

    exportFormats.add(adapter.format)
  }
}

export function assertJsonSerializable(value: unknown): void {
  const ancestors = new Set<object>()

  const visit = (candidate: unknown, path: string): void => {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean"
    ) {
      return
    }

    if (typeof candidate === "number") {
      if (Number.isFinite(candidate) && !Object.is(candidate, -0)) return
      throwSerializationError(path)
    }

    if (typeof candidate !== "object") {
      throwSerializationError(path)
    }

    if (ancestors.has(candidate)) {
      throwSerializationError(path)
    }

    ancestors.add(candidate)

    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) {
        if (!Object.hasOwn(candidate, index)) {
          throwSerializationError(`${path}[${index}]`)
        }
        visit(candidate[index], `${path}[${index}]`)
      }
    } else {
      const prototype = Object.getPrototypeOf(candidate)
      if (prototype !== Object.prototype && prototype !== null) {
        throwSerializationError(path)
      }

      for (const key of Reflect.ownKeys(candidate)) {
        if (typeof key !== "string") {
          throwSerializationError(path)
        }

        const descriptor = Object.getOwnPropertyDescriptor(candidate, key)
        if (
          !descriptor ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          throwSerializationError(`${path}.${key}`)
        }

        visit(descriptor.value, `${path}.${key}`)
      }
    }

    ancestors.delete(candidate)
  }

  visit(value, "content")
}

function throwSerializationError(path: string): never {
  throw new ToolRuntimeError(
    "NON_SERIALIZABLE_DOCUMENT",
    `Document content at "${path}" is not losslessly JSON serializable.`,
  )
}

function assertToolMatch<TContent, TCommand extends ToolCommand>(
  definition: ToolDefinition<TContent, TCommand>,
  document: Readonly<ToolDocument<unknown>>,
): void {
  if (document.toolId !== definition.metadata.id) {
    throw new ToolRuntimeError(
      "DOCUMENT_TOOL_MISMATCH",
      `Document belongs to "${document.toolId}", not "${definition.metadata.id}".`,
    )
  }
}

function assertDocumentCompatibility<
  TContent,
  TCommand extends ToolCommand,
>(
  definition: ToolDefinition<TContent, TCommand>,
  document: Readonly<ToolDocument<unknown>>,
): void {
  assertToolMatch(definition, document)

  if (document.schemaVersion !== definition.documentVersion) {
    throw new ToolRuntimeError(
      document.schemaVersion > definition.documentVersion
        ? "DOCUMENT_VERSION_AHEAD"
        : "MIGRATION_NOT_FOUND",
      `Document version ${document.schemaVersion} is incompatible with tool version ${definition.documentVersion}.`,
    )
  }
}
