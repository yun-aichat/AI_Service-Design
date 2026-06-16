const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CloudBaseAuthAdapter,
  normalizeDestination,
  toAuthSession,
} = require("../../../../.plugin-staging/auth-tests/infrastructure/cloudbase/auth/auth-adapter-core.js");
const {
  resolveCloudBaseAuthConfig,
} = require("../../../../.plugin-staging/auth-tests/infrastructure/cloudbase/auth/config-core.js");

function createClient(overrides = {}) {
  return {
    getSession: async () => ({ data: {} }),
    signInWithOtp: async () => ({ data: {} }),
    signOut: async () => undefined,
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe() {} } },
    }),
    ...overrides,
  };
}

test("requires explicit CloudBase browser configuration", () => {
  assert.throws(
    () => resolveCloudBaseAuthConfig({}),
    (error) =>
      error.code === "CONFIG_MISSING" &&
      error.message.includes("VITE_CLOUDBASE_PUBLISHABLE_KEY")
  );
  assert.throws(
    () =>
      resolveCloudBaseAuthConfig({
        VITE_CLOUDBASE_ENV_ID: "env",
        VITE_CLOUDBASE_REGION: "ap-shanghai",
        VITE_CLOUDBASE_PUBLISHABLE_KEY: "secret-key",
      }),
    (error) => error.code === "CONFIG_INVALID"
  );
});

test("normalizes email and mainland China phone destinations", () => {
  assert.equal(normalizeDestination("email", " User@Example.com "), "user@example.com");
  assert.equal(normalizeDestination("phone", "138 0013 8000"), "+8613800138000");
  assert.throws(
    () => normalizeDestination("phone", "123"),
    (error) => error.code === "INPUT_INVALID"
  );
});

test("restores a valid session and treats an expired session as signed out", async () => {
  const validSession = {
    access_token: "token",
    expires_in: 7200,
    user: {
      id: "user-1",
      email: "user@example.com",
      groups: ["billing-admin"],
      app_metadata: { roles: ["admin"] },
    },
  };
  const adapter = new CloudBaseAuthAdapter(
    createClient({
      getSession: async () => ({ data: { session: validSession } }),
    })
  );
  assert.deepEqual(await adapter.getSession(), toAuthSession(validSession));
  assert.deepEqual(toAuthSession(validSession).user.roles, ["billing-admin", "admin"]);

  const expiredAdapter = new CloudBaseAuthAdapter(
    createClient({ getSession: async () => ({ data: { session: null } }) })
  );
  assert.equal(await expiredAdapter.getSession(), null);
});

test("sends and verifies email OTP through the CloudBase client", async () => {
  let request;
  let verification;
  const adapter = new CloudBaseAuthAdapter(
    createClient({
      signInWithOtp: async (input) => {
        request = input;
        return {
          data: {
            verifyOtp: async (input) => {
              verification = input;
              return {
                data: {
                  session: {
                    access_token: "email-token",
                    expires_in: 7200,
                    user: { id: "email-user", email: "user@example.com" },
                  },
                },
              };
            },
          },
        };
      },
    })
  );

  const challenge = await adapter.requestOtp({
    channel: "email",
    destination: "USER@example.com",
  });
  const session = await challenge.verify("123456");
  assert.equal(request.email, "user@example.com");
  assert.equal(verification.email, "user@example.com");
  assert.equal(session.user.id, "email-user");
});

test("sends and verifies phone OTP through the CloudBase client", async () => {
  let request;
  let verification;
  const adapter = new CloudBaseAuthAdapter(
    createClient({
      signInWithOtp: async (input) => {
        request = input;
        return {
          data: {
            verifyOtp: async (input) => {
              verification = input;
              return {
                data: {
                  session: {
                    access_token: "phone-token",
                    user: { id: "phone-user", phone_number: "+8613800138000" },
                  },
                },
              };
            },
          },
        };
      },
    })
  );

  const challenge = await adapter.requestOtp({
    channel: "phone",
    destination: "13800138000",
  });
  const session = await challenge.verify("654321");
  assert.equal(request.phone, "+8613800138000");
  assert.equal(verification.phone, "+8613800138000");
  assert.equal(session.user.phone, "+8613800138000");
});

test("preserves CloudBase error codes and classifies network failures", async () => {
  const serviceErrorAdapter = new CloudBaseAuthAdapter(
    createClient({
      signInWithOtp: async () => ({
        data: {},
        error: { code: "OTP_RATE_LIMIT", helpMessage: "请求过于频繁。" },
      }),
    })
  );
  await assert.rejects(
    () =>
      serviceErrorAdapter.requestOtp({
        channel: "email",
        destination: "user@example.com",
      }),
    (error) => error.code === "OTP_RATE_LIMIT" && error.message === "请求过于频繁。"
  );

  const networkErrorAdapter = new CloudBaseAuthAdapter(
    createClient({
      getSession: async () => {
        throw new TypeError("Failed to fetch");
      },
    })
  );
  await assert.rejects(
    () => networkErrorAdapter.getSession(),
    (error) => error.code === "NETWORK_ERROR"
  );
});

test("signs out and reports sign-out failures", async () => {
  let signedOut = false;
  const adapter = new CloudBaseAuthAdapter(
    createClient({
      signOut: async () => {
        signedOut = true;
      },
    })
  );
  await adapter.signOut();
  assert.equal(signedOut, true);

  const failingAdapter = new CloudBaseAuthAdapter(
    createClient({
      signOut: async () => {
        throw { code: "SIGN_OUT_FAILED", message: "退出失败。" };
      },
    })
  );
  await assert.rejects(
    () => failingAdapter.signOut(),
    (error) => error.code === "SIGN_OUT_FAILED"
  );
});
