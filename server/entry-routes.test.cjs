const assert = require("node:assert/strict");
const test = require("node:test");
const {
  resolveEntryPage,
} = require("../.plugin-staging/entry-route-tests/entry-routes.js");
const {
  getBillingRedirectPath,
} = require("../.plugin-staging/entry-route-tests/features/billing/billing-access.js");

test("routes billing aliases to the billing entry page", () => {
  assert.equal(resolveEntryPage("/billing"), "billing");
  assert.equal(resolveEntryPage("/Billing"), "billing");
  assert.equal(resolveEntryPage("/account/billing"), "billing");
});

test("keeps the journey map as the root entry page", () => {
  assert.equal(resolveEntryPage("/"), "app");
});

test("redirects unauthenticated billing access to the account page", () => {
  assert.equal(
    getBillingRedirectPath({ authLoading: false, hasSession: false }),
    "/account"
  );
  assert.equal(
    getBillingRedirectPath({ authLoading: true, hasSession: false }),
    null
  );
  assert.equal(
    getBillingRedirectPath({ authLoading: false, hasSession: true }),
    null
  );
});
