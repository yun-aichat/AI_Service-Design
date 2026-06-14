const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const dist = join(__dirname, "..", "dist");
const account = join(dist, "account");

mkdirSync(account, { recursive: true });
copyFileSync(join(dist, "index.html"), join(account, "index.html"));
