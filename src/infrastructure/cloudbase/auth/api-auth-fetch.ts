type FetchLike = typeof fetch;

type CreateApiAuthFetchOptions = {
  fetchImpl: FetchLike;
  getAccessToken: () => Promise<string | null>;
  origin: string;
};

function toHeadersRecord(headers: HeadersInit | undefined) {
  const normalized = new Headers(headers);
  return Object.fromEntries(normalized.entries());
}

function shouldAttachAuthorization(input: RequestInfo | URL, origin: string) {
  const target =
    typeof input === "string" || input instanceof URL
      ? new URL(String(input), origin)
      : new URL(input.url, origin);

  return target.origin === origin && target.pathname.startsWith("/api/");
}

export function createApiAuthFetch({
  fetchImpl,
  getAccessToken,
  origin,
}: CreateApiAuthFetchOptions): FetchLike {
  return async function apiAuthFetch(input: RequestInfo | URL, init?: RequestInit) {
    const request = input instanceof Request ? input : null;
    const mergedHeaders = new Headers(request?.headers || undefined);

    for (const [key, value] of Object.entries(toHeadersRecord(init?.headers))) {
      mergedHeaders.set(key, value);
    }

    if (!shouldAttachAuthorization(input, origin) || mergedHeaders.has("Authorization")) {
      return fetchImpl(input, init);
    }

    const token = await getAccessToken().catch(() => null);
    if (!token) {
      return fetchImpl(input, init);
    }

    const nextInit = {
      ...init,
      headers: {
        ...toHeadersRecord(request?.headers),
        ...toHeadersRecord(init?.headers),
        Authorization: `Bearer ${token}`,
      },
    };

    return fetchImpl(input, nextInit);
  } as FetchLike;
}

export function installApiAuthFetch(options: {
  getAccessToken: () => Promise<string | null>;
  origin?: string;
}) {
  if (typeof window === "undefined") return;

  const currentFetch = window.fetch.bind(window);
  const taggedFetch = currentFetch as typeof currentFetch & {
    __apiAuthWrapped?: boolean;
  };
  if (taggedFetch.__apiAuthWrapped) return;

  const wrappedFetch = createApiAuthFetch({
    fetchImpl: currentFetch,
    getAccessToken: options.getAccessToken,
    origin: options.origin || window.location.origin,
  }) as typeof currentFetch & { __apiAuthWrapped?: boolean };

  wrappedFetch.__apiAuthWrapped = true;
  window.fetch = wrappedFetch;
}
