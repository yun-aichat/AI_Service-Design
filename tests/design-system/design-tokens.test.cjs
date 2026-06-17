const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const rootPath = path.resolve(__dirname, "../..")
const tokenSourcePath = path.resolve(
  rootPath,
  "src/design-system/design-tokens.json",
)
const themePath = path.resolve(rootPath, "src/design-system/theme.ts")
const docsPath = path.resolve(rootPath, "docs/design-tokens.md")

test("design tokens have a dedicated source artifact consumed by theme.ts", () => {
  assert.ok(fs.existsSync(tokenSourcePath), "missing design-tokens.json")

  const tokenSource = JSON.parse(fs.readFileSync(tokenSourcePath, "utf8"))
  const themeSource = fs.readFileSync(themePath, "utf8")

  assert.ok(tokenSource.core, "missing core token group")
  assert.ok(tokenSource.semantic, "missing semantic token group")
  assert.ok(tokenSource.layout, "missing layout token group")
  assert.ok(tokenSource.export, "missing export token group")
  assert.match(themeSource, /from "\.\/design-tokens\.json"/)
})

test("design token docs point to the shared token source instead of theme.ts alone", () => {
  const docsSource = fs.readFileSync(docsPath, "utf8")

  assert.match(docsSource, /src\/design-system\/design-tokens\.json/)
  assert.doesNotMatch(
    docsSource,
    /固定色值只允许出现在 `src\/design-system\/theme\.ts`/,
  )
})
