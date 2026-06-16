const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const dist = join(__dirname, "..", "dist");
const account = join(dist, "account");
const billing = join(dist, "billing");
const admin = join(dist, "admin");
const adminBilling = join(admin, "billing");

mkdirSync(account, { recursive: true });
copyFileSync(join(dist, "index.html"), join(account, "index.html"));
mkdirSync(billing, { recursive: true });
copyFileSync(join(dist, "index.html"), join(billing, "index.html"));
mkdirSync(admin, { recursive: true });
copyFileSync(join(dist, "index.html"), join(admin, "index.html"));
mkdirSync(adminBilling, { recursive: true });
copyFileSync(join(dist, "index.html"), join(adminBilling, "index.html"));
