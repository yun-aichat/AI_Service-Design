const assert = require("node:assert/strict")
const test = require("node:test")

const {
  loadCurrentJourneyMapBaseline,
} = require("./load-current-baseline.cjs")

test("journey SVG export palette is sourced from shared design tokens", () => {
  const { journeyToolSource } = loadCurrentJourneyMapBaseline()

  assert.match(journeyToolSource, /from "\.\.\/\.\.\/design-system\/design-tokens\.json"/)
  assert.doesNotMatch(journeyToolSource, /fill="#202522"/)
  assert.doesNotMatch(journeyToolSource, /fill="#ffffff"/)
  assert.doesNotMatch(journeyToolSource, /fill="#fff3e8"/)
  assert.doesNotMatch(journeyToolSource, /stroke="#deded9"/)
  assert.doesNotMatch(journeyToolSource, /fill="#f8f8f6"/)
  assert.doesNotMatch(journeyToolSource, /fill="#66716b"/)
  assert.doesNotMatch(journeyToolSource, /stroke="#ecece7"/)
})
