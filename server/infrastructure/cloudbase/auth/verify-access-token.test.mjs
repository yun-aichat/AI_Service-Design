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
          groups: [{ id: "member" }],
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
    roles: ["member"],
  });
});

test("CloudBaseAccessTokenVerifier returns null for rejected tokens", async () => {
  const verifier = new CloudBaseAccessTokenVerifier({
    fetchImpl: async () => new Response(null, { status: 401 }),
  });
  assert.equal(await verifier.verify("expired-token"), null);
  assert.equal(await verifier.verify(""), null);
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
