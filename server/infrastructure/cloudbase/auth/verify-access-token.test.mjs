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
    region: "ap-shanghai",
    fetchImpl: async (url, options) => {
      assert.equal(
        url,
        "https://env-test.ap-shanghai.tcb-api.tencentcloudapi.com/auth/v1/user/me",
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
