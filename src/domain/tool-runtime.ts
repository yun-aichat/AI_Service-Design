export type ToolId = string
export type ToolDocumentId = string
export type ProjectId = string

export type ToolMetadata = {
  id: ToolId
  name: string
  description: string
  category: string
  icon?: string
  tags: readonly string[]
  inputKinds: readonly string[]
  outputKinds: readonly string[]
}

export type ToolDocument<TContent = unknown> = {
  id: ToolDocumentId
  projectId: ProjectId
  toolId: ToolId
  schemaVersion: number
  revision: number
  title: string
  content: TContent
  createdAt: string
  updatedAt: string
}

export type ToolCommand<TType extends string = string, TPayload = unknown> = {
  id: string
  type: TType
  payload: TPayload
  expectedRevision: number
  issuedAt: string
  actor: {
    type: "user" | "assistant" | "system"
    id?: string
  }
}

export type ToolCommandResult<TContent, TCommand extends ToolCommand> = {
  document: ToolDocument<TContent>
  command: TCommand
  previousRevision: number
  appliedAt: string
}

export type ToolMigration<TContent> = {
  fromVersion: number
  toVersion: number
  migrate(content: unknown): TContent
}

export type ToolExportRequest<TOptions = unknown> = {
  format: string
  options?: TOptions
}

export type ToolExportArtifact = {
  fileName: string
  mediaType: string
  data: string | Uint8Array
}

export type ToolExportAdapter<TContent, TOptions = unknown> = {
  format: string
  label: string
  export(
    document: Readonly<ToolDocument<TContent>>,
    request: ToolExportRequest<TOptions>,
  ): ToolExportArtifact | Promise<ToolExportArtifact>
}

export type ToolAiContract<TContent, TCommand extends ToolCommand> = {
  skillId: string
  skillVersion: string
  buildContext(document: Readonly<ToolDocument<TContent>>): unknown
  parseProposal(input: unknown): readonly TCommand[]
}

export type ToolDefinition<
  TContent,
  TCommand extends ToolCommand = ToolCommand,
> = {
  metadata: ToolMetadata
  documentVersion: number
  createInitialDocument(
    input: unknown,
    context: Readonly<CreateToolDocumentInput>,
  ): TContent
  validateDocument(input: unknown): TContent
  applyCommand(document: Readonly<TContent>, command: TCommand): TContent
  migrations: readonly ToolMigration<TContent>[]
  exports: readonly ToolExportAdapter<TContent, unknown>[]
  ai?: ToolAiContract<TContent, TCommand>
}

// The registry is a heterogeneous collection; consumers narrow a definition
// after resolving it by its stable metadata id.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any, ToolCommand<string, any>>

export type CreateToolDocumentInput = {
  id: ToolDocumentId
  projectId: ProjectId
  title: string
  initialValue?: unknown
  now: string
}

export class ToolRuntimeError extends Error {
  constructor(
    readonly code:
      | "DOCUMENT_TOOL_MISMATCH"
      | "DOCUMENT_VERSION_AHEAD"
      | "DUPLICATE_TOOL"
      | "EXPORT_NOT_FOUND"
      | "INVALID_DEFINITION"
      | "MIGRATION_NOT_FOUND"
      | "NON_SERIALIZABLE_DOCUMENT"
      | "REVISION_CONFLICT"
      | "TOOL_NOT_FOUND",
    message: string,
  ) {
    super(message)
    this.name = "ToolRuntimeError"
  }
}
