const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createApiAuthFetch,
} = require("../.plugin-staging/api-auth-fetch-tests/infrastructure/cloudbase/auth/api-auth-fetch.js");

test("adds bearer token to same-origin api requests when authorization is missing", async () => {
  let capturedInput = null;
  let capturedInit = null;
  const fetchWithAuth = createApiAuthFetch({
    fetchImpl: async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      return { ok: true, status: 200 };
    },
    getAccessToken: async () => "token-123",
    origin: "http://127.0.0.1:4173",
  });

  await fetchWithAuth("http://127.0.0.1:4173/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  assert.equal(capturedInput, "http://127.0.0.1:4173/api/billing");
  assert.equal(capturedInit.headers.Authorization, "Bearer token-123");
  assert.equal(capturedInit.headers["content-type"], "application/json");
});

test("preserves explicit authorization headers", async () => {
  let capturedInit = null;
  const fetchWithAuth = createApiAuthFetch({
    fetchImpl: async (_input, init) => {
      capturedInit = init;
      return { ok: true, status: 200 };
    },
    getAccessToken: async () => "token-123",
    origin: "http://127.0.0.1:4173",
  });

  await fetchWithAuth("/api/billing", {
    headers: { Authorization: "Bearer manual-token" },
  });

  assert.equal(capturedInit.headers.Authorization, "Bearer manual-token");
});

test("does not add bearer token to non-api requests", async () => {
  let capturedInit = null;
  const fetchWithAuth = createApiAuthFetch({
    fetchImpl: async (_input, init) => {
      capturedInit = init;
      return { ok: true, status: 200 };
    },
    getAccessToken: async () => "token-123",
    origin: "http://127.0.0.1:4173",
  });

  await fetchWithAuth("/billing", {});

  assert.deepEqual(capturedInit, {});
});
