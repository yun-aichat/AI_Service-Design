const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const dist = join(__dirname, "..", "dist");
const account = join(dist, "account");
const billing = join(dist, "billing");

mkdirSync(account, { recursive: true });
copyFileSync(join(dist, "index.html"), join(account, "index.html"));
mkdirSync(billing, { recursive: true });
copyFileSync(join(dist, "index.html"), join(billing, "index.html"));
