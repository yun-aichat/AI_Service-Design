import {
  type AnyToolDefinition,
  type ToolId,
  ToolRuntimeError,
} from "../domain/tool-runtime"
import { assertToolDefinition } from "../application/tool-runtime"
import { journeyMapToolDefinition } from "./journey-map/tool"
import { personaToolDefinition } from "./persona/tool"

export type ToolRegistry = {
  get(toolId: ToolId): AnyToolDefinition
  has(toolId: ToolId): boolean
  list(): readonly AnyToolDefinition[]
}

export function defineToolRegistry(
  definitions: readonly AnyToolDefinition[],
): ToolRegistry {
  const tools = new Map<ToolId, AnyToolDefinition>()

  for (const definition of definitions) {
    assertToolDefinition(definition)
    const toolId = definition.metadata.id

    if (tools.has(toolId)) {
      throw new ToolRuntimeError(
        "DUPLICATE_TOOL",
        `Tool "${toolId}" is registered more than once.`,
      )
    }

    tools.set(toolId, definition)
  }

  const registeredTools = Object.freeze([...tools.values()])

  return Object.freeze({
    get(toolId: ToolId): AnyToolDefinition {
      const definition = tools.get(toolId)

      if (!definition) {
        throw new ToolRuntimeError(
          "TOOL_NOT_FOUND",
          `Tool "${toolId}" is not registered.`,
        )
      }

      return definition
    },
    has(toolId: ToolId): boolean {
      return tools.has(toolId)
    },
    list(): readonly AnyToolDefinition[] {
      return registeredTools
    },
  })
}

// Tool modules are added here only after their domain model is migrated.
export const toolRegistry = defineToolRegistry([journeyMapToolDefinition, personaToolDefinition])
