import { getCloudBaseAuthPort } from "../../infrastructure/cloudbase/auth/cloudbase-auth-port";

export type BillingPage<T> = {
  items: T[];
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export type CreditLedgerRecord = {
  id: string;
  accountId: string;
  userId: string | null;
  orderId: string | null;
  reservationId: string | null;
  referenceType: string;
  referenceId: string;
  operation: string;
  credits: number;
  availableDelta: number;
  reservedDelta: number;
  consumedDelta: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AiActionPricingRecord = {
  id: string;
  pricingId: string;
  toolKey: string;
  actionKey: string;
  tierKey: string;
  displayName: string;
  description: string | null;
  creditCost: number;
  enabled: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type UpdateActionPricingCommand = {
  toolKey: string;
  actionKey: string;
  tierKey: string;
  creditCost: number;
  enabled: boolean;
  expectedVersion: number;
};

export type AiUsageEventRecord = {
  id: string;
  userId: string | null;
  projectId: string | null;
  documentId: string | null;
  toolKey: string;
  actionKey: string;
  tierKey: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostValue: number | null;
  chargedCredits: number;
  status: string;
  referenceId: string;
  createdAt: string;
};

export type BillingAuthProfile = {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    displayName: string | null;
    roles: string[];
  };
};

export class BillingConfigRequestError extends Error {
  code: string | null;
  status: number;

  constructor(message: string, options?: { code?: string | null; status?: number }) {
    super(message);
    this.name = "BillingConfigRequestError";
    this.code = options?.code ?? null;
    this.status = options?.status ?? 500;
  }
}

async function requestBillingConfig<TResponse>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<TResponse> {
  const token = await readAccessToken().catch(() => null);
  const response = await fetch("/api/billing-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new BillingConfigRequestError(
      typeof result?.error === "string" ? result.error : "Billing config request failed.",
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

export async function listCreditLedger(input?: {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: string;
}): Promise<BillingPage<CreditLedgerRecord>> {
  return requestBillingConfig("listCreditLedger", input);
}

export async function updateActionPricing(
  command: UpdateActionPricingCommand,
): Promise<AiActionPricingRecord> {
  return requestBillingConfig("updateActionPricing", { command });
}

export async function listAiUsageEvents(input?: {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: string;
}): Promise<BillingPage<AiUsageEventRecord>> {
  return requestBillingConfig("listAiUsageEvents", input);
}

export async function debugAuthProfile(): Promise<BillingAuthProfile> {
  return requestBillingConfig("debugAuthProfile");
}
