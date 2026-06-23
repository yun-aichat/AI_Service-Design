import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudBaseAccessTokenVerifier,
  readBearerToken,
} from "./verify-access-token.mjs";

test("readBearerToken accepts Bearer authorization headers", () => {
  assert.equal(readBearerToken("Bearer token-value"), "token-value");
  assert.equal(readBearerToken("bearer another-token"), "another-token");
  assert.equal(readBearerToken("Basic credentials"), null);
});

test("CloudBaseAccessTokenVerifier maps a verified profile", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    envId: "env-test",
    fetchImpl: async (url, options) => {
      assert.equal(
        url,
        "https://env-test.api.tcloudbasegateway.com/auth/v1/user/me",
      );
      assert.equal(options.headers.Authorization, "Bearer valid-token");
      return new Response(
        JSON.stringify({
          sub: "user-1",
          email: "user@example.com",
          phone_number: "+8613800138000",
          name: "Test User",
          groups: [{ id: "member" }, "billing-admin"],
          app_metadata: {
            roles: ["admin"],
          },
        }),
        { status: 200 },
      );
    },
  });

  assert.deepEqual(await verifier.verify("valid-token"), {
    id: "user-1",
    email: "user@example.com",
    phone: "+8613800138000",
    displayName: "Test User",
    roles: ["member", "billing-admin", "admin"],
  });
});

test("CloudBaseAccessTokenVerifier returns null for rejected tokens", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    fetchImpl: async () => new Response(null, { status: 401 }),
  });
  assert.equal(await verifier.verify("expired-token"), null);
  assert.equal(await verifier.verify(""), null);
});

test("CloudBaseAccessTokenVerifier falls back to local jwt claims when enabled for acceptance host", async () => {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "local-user-1",
      email: "local@example.com",
      phone_number: "+8613800138000",
      name: "Local User",
      role: ["billing-admin"],
    }),
    "utf8",
  ).toString("base64url");
  const verifier = new CloudBaseAccessTokenVerifier({
    allowUnverifiedTokenFallback: true,
    fetchImpl: async () => new Response(null, { status: 401 }),
  });

  assert.deepEqual(await verifier.verify(`header.${payload}.signature`), {
    id: "local-user-1",
    email: "local@example.com",
    phone: "+8613800138000",
    displayName: "Local User",
    roles: ["billing-admin"],
  });
});

test("CloudBaseAccessTokenVerifier keeps rejecting invalid tokens when fallback is enabled but claims are unusable", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    allowUnverifiedTokenFallback: true,
    fetchImpl: async () => new Response(null, { status: 401 }),
  });

  assert.equal(await verifier.verify("not-a-jwt"), null);
});

test("CloudBaseAccessTokenVerifier accepts user_id when sub is absent", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          user_id: "anonymous-user-1",
          groups: [],
        }),
        { status: 200 },
      ),
  });

  assert.deepEqual(await verifier.verify("anon-token"), {
    id: "anonymous-user-1",
    email: null,
    phone: null,
    displayName: null,
    roles: [],
  });
});

test("CloudBaseAccessTokenVerifier reads top-level role arrays", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          sub: "user-role-only",
          phone_number: "+8613828318136",
          role: ["admin"],
        }),
        { status: 200 },
      ),
  });

  assert.deepEqual(await verifier.verify("role-token"), {
    id: "user-role-only",
    email: null,
    phone: "+8613828318136",
    displayName: null,
    roles: ["admin"],
  });
});

test("CloudBaseAccessTokenVerifier reads top-level role strings", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          sub: "user-role-string",
          phone_number: "+8613828318136",
          role: "admin",
        }),
        { status: 200 },
      ),
  });

  assert.deepEqual(await verifier.verify("role-string-token"), {
    id: "user-role-string",
    email: null,
    phone: "+8613828318136",
    displayName: null,
    roles: ["admin"],
  });
});

test("CloudBaseAccessTokenVerifier maps internal administrator users to admin role", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          sub: "internal-admin-user",
          phone_number: "+8613828318136",
          internal_user_type: "administrator",
        }),
        { status: 200 },
      ),
  });

  assert.deepEqual(await verifier.verify("internal-admin-token"), {
    id: "internal-admin-user",
    email: null,
    phone: "+8613828318136",
    displayName: null,
    roles: ["admin"],
  });
});

test("CloudBaseAccessTokenVerifier reads object-shaped role identities", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          sub: "object-role-user",
          phone_number: "+8613828318136",
          groups: [{ RoleIdentity: "admin" }],
          roles: [{ roleIdentity: "billing-admin" }],
        }),
        { status: 200 },
      ),
  });

  assert.deepEqual(await verifier.verify("object-role-token"), {
    id: "object-role-user",
    email: null,
    phone: "+8613828318136",
    displayName: null,
    roles: ["admin", "billing-admin"],
  });
});
