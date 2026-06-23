const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canEnterAdminConsole,
  hasLocalAdminRole,
} = require("../.plugin-staging/admin-access-tests/features/admin/admin-access.js");

test("hasLocalAdminRole accepts admin and billing-admin", () => {
  assert.equal(hasLocalAdminRole(["admin"]), true);
  assert.equal(hasLocalAdminRole(["billing-admin"]), true);
  assert.equal(hasLocalAdminRole(["member"]), false);
});

test("canEnterAdminConsole defers final authorization to the server for signed-in users", () => {
  assert.equal(canEnterAdminConsole({ hasSession: false, roles: [] }), false);
  assert.equal(canEnterAdminConsole({ hasSession: true, roles: ["admin"] }), true);
  assert.equal(canEnterAdminConsole({ hasSession: true, roles: [] }), true);
});
