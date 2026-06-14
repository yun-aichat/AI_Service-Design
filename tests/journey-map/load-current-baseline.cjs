const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const APP_PATH = path.resolve(__dirname, "../../src/App.tsx")
const JOURNEY_PAGE_PATH = path.resolve(
  __dirname,
  "../../src/tools/journey-map/JourneyMapPage.tsx",
)
const JOURNEY_TOOL_PATH = path.resolve(
  __dirname,
  "../../src/tools/journey-map/tool.ts",
)
const ASSISTANT_PANEL_PATH = path.resolve(
  __dirname,
  "../../src/features/assistant/JourneyAssistantPanel.tsx",
)
const ROOT_PATH = path.resolve(__dirname, "../..")
const TSCONFIG_PATH = path.resolve(ROOT_PATH, "tsconfig.tool-runtime-tests.json")
const TSC_BIN = require.resolve("typescript/bin/tsc")
const COMPILED_MODULE_PATH = path.resolve(
  ROOT_PATH,
  "tmp/tool-runtime-tests/tools/journey-map/index.js",
)
const COMPILED_REGISTRY_PATH = path.resolve(
  ROOT_PATH,
  "tmp/tool-runtime-tests/tools/registry.js",
)

function loadCurrentJourneyMapBaseline(options = {}) {
  execFileSync(process.execPath, [TSC_BIN, "-p", TSCONFIG_PATH], {
    cwd: ROOT_PATH,
    stdio: "pipe",
  })

  delete require.cache[COMPILED_MODULE_PATH]
  delete require.cache[COMPILED_REGISTRY_PATH]

  const moduleExports = require(COMPILED_MODULE_PATH)
  const registryExports = require(COMPILED_REGISTRY_PATH)
  const sourceText = fs.readFileSync(APP_PATH, "utf8")
  const journeyPageSource = fs.readFileSync(JOURNEY_PAGE_PATH, "utf8")
  const journeyToolSource = fs.readFileSync(JOURNEY_TOOL_PATH, "utf8")
  const assistantSource = fs.readFileSync(ASSISTANT_PANEL_PATH, "utf8")
  const fixedNow = options.now ?? 1_780_800_000_000
  const randomValues = [...(options.randomValues ?? [0.125])]
  let randomIndex = 0

  const withFixedRuntime = (action) => {
    const originalNow = Date.now
    const originalRandom = Math.random
    Date.now = () => fixedNow
    Math.random = () =>
      randomValues[randomIndex++] ?? randomValues.at(-1) ?? 0.125
    try {
      return action()
    } finally {
      Date.now = originalNow
      Math.random = originalRandom
    }
  }

  const functions = Object.fromEntries(
    Object.entries(moduleExports).map(([key, value]) => [
      key,
      typeof value === "function"
        ? (...args) => withFixedRuntime(() => value(...args))
        : value,
    ]),
  )

  return {
    appPath: APP_PATH,
    appSource: sourceText,
    journeyPagePath: JOURNEY_PAGE_PATH,
    journeyPageSource,
    journeyToolPath: JOURNEY_TOOL_PATH,
    journeyToolSource,
    assistantPanelPath: ASSISTANT_PANEL_PATH,
    assistantSource,
    functions,
    registry: registryExports.toolRegistry,
  }
}

module.exports = {
  loadCurrentJourneyMapBaseline,
}
