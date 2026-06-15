import { getCloudBaseAuthPort } from "../auth/cloudbase-auth-port";

export type CreditAccount = {
  id: string;
  accountId: string;
  availableCredits: number;
  reservedCredits: number;
  consumedCredits: number;
  totalIssuedCredits: number;
  totalExpiredCredits: number;
};

export type CreditPackage = {
  packageId: string;
  displayName: string;
  credits: number;
  bonusCredits: number;
  totalCredits?: number;
  priceValue: number;
  currency: string;
  enabled: boolean;
  validityDays: number | null;
  channelScope: string[] | null;
  description: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CreditLedgerEntry = {
  id: string;
  accountId: string;
  orderId: string | null;
  reservationId: string | null;
  referenceType: string;
  referenceId: string;
  idempotencyKey?: string;
  operation: string;
  credits: number;
  availableDelta: number;
  reservedDelta: number;
  consumedDelta: number;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type PageResult<T> = {
  items: T[];
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export class BillingRequestError extends Error {
  code: string | null;
  status: number;

  constructor(message: string, options?: { code?: string | null; status?: number }) {
    super(message);
    this.name = "BillingRequestError";
    this.code = options?.code ?? null;
    this.status = options?.status ?? 500;
  }
}

export async function getMyCreditAccount(): Promise<CreditAccount> {
  return requestBilling("getMyCreditAccount", {});
}

export async function listCreditPackages(input?: {
  enabled?: boolean;
  limit?: number;
  offset?: number;
}): Promise<PageResult<CreditPackage>> {
  return requestBilling("listCreditPackages", { enabled: true, ...input });
}

export async function listMyLedgerEntries(input?: {
  operation?: string;
  referenceType?: string;
  limit?: number;
  offset?: number;
}): Promise<PageResult<CreditLedgerEntry>> {
  return requestBilling("listMyLedgerEntries", input || {});
}

async function requestBilling<TResponse>(
  action: string,
  payload: unknown,
): Promise<TResponse> {
  const token = await readAccessToken().catch(() => null);
  const response = await fetch("/api/billing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...(payload as Record<string, unknown>) }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BillingRequestError(
      typeof result?.error === "string" ? result.error : "计费请求失败",
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
