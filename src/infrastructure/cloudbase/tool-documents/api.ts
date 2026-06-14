import { getCloudBaseAuthPort } from "../auth/cloudbase-auth-port";

export type ProjectRecord = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ToolDocumentRecord<TContent = unknown> = {
  id: string;
  projectId: string;
  ownerId: string;
  toolId: string;
  title: string;
  schemaVersion: number;
  revision: number;
  content: TContent;
  createdAt: string;
  updatedAt: string;
};

export type ToolDocumentRevisionRecord<TContent = unknown> = {
  id: string;
  documentId: string;
  projectId: string;
  ownerId: string;
  toolId: string;
  revision: number;
  source: "manual" | "ai_proposal" | "import" | "migration" | "system";
  actorId: string | null;
  commandId: string | null;
  content: TContent;
  summary: string | null;
  createdAt: string;
};

export type ToolUsageEvent = {
  id: string;
  userId: string;
  projectId: string | null;
  documentId: string | null;
  toolId: string;
  eventType:
    | "tool_saved"
    | "proposal_applied"
    | "ai_generated"
    | "exported"
    | "document_created";
  eventSource: "web" | "server" | "system";
  revision: number | null;
  exportFormat: "md" | "json" | "csv" | "svg" | "pdf" | null;
  sessionId: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type SaveJourneyMapInput<TContent> = {
  documentId: string;
  projectId: string;
  title: string;
  schemaVersion: number;
  expectedRevision: number | null;
  content: TContent;
  source?: ToolDocumentRevisionRecord["source"];
  commandId?: string | null;
  summary?: string | null;
  idempotencyKey?: string | null;
  eventMetadata?: Record<string, unknown>;
};

export type SaveJourneyMapResult<TContent> = {
  document: ToolDocumentRecord<TContent>;
  revision: ToolDocumentRevisionRecord<TContent>;
  events: ToolUsageEvent[];
};

export type JourneyMapContextRecord<TContent> = {
  project: ProjectRecord;
  projects: ProjectRecord[];
  document: ToolDocumentRecord<TContent> | null;
  suggestedDocumentId: string;
};

export class ToolDocumentsRequestError extends Error {
  code: string | null;
  status: number;

  constructor(message: string, options?: { code?: string | null; status?: number }) {
    super(message);
    this.name = "ToolDocumentsRequestError";
    this.code = options?.code ?? null;
    this.status = options?.status ?? 500;
  }
}

export async function readToolDocument<TContent>(input: {
  documentId: string;
}): Promise<ToolDocumentRecord<TContent>> {
  return requestToolDocuments("readDocument", input);
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return requestToolDocuments("listProjects", {});
}

export async function getJourneyMapContext<TContent>(input?: {
  projectId?: string | null;
  documentId?: string | null;
}): Promise<JourneyMapContextRecord<TContent>> {
  return requestToolDocuments("getJourneyMapContext", input || {});
}

export async function saveJourneyMap<TContent>(
  input: SaveJourneyMapInput<TContent>,
): Promise<SaveJourneyMapResult<TContent>> {
  return requestToolDocuments("saveJourneyMap", input);
}

export async function applyJourneyMapProposal<TContent>(
  input: SaveJourneyMapInput<TContent> & { source: "ai_proposal" },
): Promise<SaveJourneyMapResult<TContent>> {
  return requestToolDocuments("applyJourneyMapProposal", input);
}

export async function recordJourneyMapExport(input: {
  projectId: string;
  documentId: string;
  revision: number | null;
  exportFormat: "md" | "json" | "csv" | "svg" | "pdf";
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return requestToolDocuments("recordExportSucceeded", {
    ...input,
    toolId: "journey-map",
  });
}

async function requestToolDocuments<TResponse>(
  action: string,
  payload: unknown,
): Promise<TResponse> {
  const token = await readAccessToken().catch(() => null);
  const response = await fetch("/api/tool-documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...(payload as Record<string, unknown>) }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ToolDocumentsRequestError(
      typeof result?.error === "string" ? result.error : "持久化请求失败",
      {
        code: typeof result?.code === "string" ? result.code : null,
        status: response.status,
      },
    );
  }

  return result as TResponse;
}

async function readAccessToken() {
  const session = await getCloudBaseAuthPort().getSession();
  return session?.accessToken || null;
}
