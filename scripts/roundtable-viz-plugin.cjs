const { spawn } = require("node:child_process");
const { watch } = require("node:fs");
const { join } = require("node:path");

const RT_DIR = join(__dirname, "..", ".roundtable-lite");
const SCRIPT = join(__dirname, "generate-roundtable-viz-data.cjs");

function regenerate() {
  const child = spawn("node", [SCRIPT], { stdio: "pipe", cwd: __dirname });
  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));
  child.on("close", (code) => {
    if (code === 0) console.log(output.trim());
    else console.error("[roundtable-viz] regeneration failed:", output.trim());
  });
}

module.exports = function roundtableVizPlugin() {
  return {
    name: "roundtable-viz",
    configureServer() {
      // Generate on startup
      regenerate();
      // Watch .roundtable-lite for changes
      let timer = null;
      try {
        watch(RT_DIR, { recursive: true }, (_event, filename) => {
          if (!filename) return;
          // Debounce: batch rapid changes
          if (timer) clearTimeout(timer);
          timer = setTimeout(regenerate, 300);
        });
      } catch {
        console.warn("[roundtable-viz] cannot watch .roundtable-lite, data will not auto-refresh in dev");
      }
    },
  };
};
