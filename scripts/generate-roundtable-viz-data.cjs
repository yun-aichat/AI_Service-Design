const { readFileSync, writeFileSync, mkdirSync, readdirSync } = require("node:fs");
const { join, dirname } = require("node:path");

const rtDir = join(__dirname, "..", ".roundtable-lite");
const outDir = join(__dirname, "..", "src", "features", "roundtable-lite");
const outPath = join(outDir, "data.json");

function readJSONL(filePath) {
  const text = readFileSync(filePath, "utf-8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function readText(filePath) {
  return readFileSync(filePath, "utf-8");
}

// ---- Parse tasks ----
const taskEvents = readJSONL(join(rtDir, "tasks.jsonl"));

// Build task summary: latest state per task_id
const taskMap = {};
for (const evt of taskEvents) {
  const id = evt.task_id;
  if (!taskMap[id]) {
    taskMap[id] = {
      task_id: id,
      title: evt.title || "",
      module: evt.module || "",
      risk: evt.risk || "",
      task_type: evt.task_type || "",
      review_required: evt.review_required ?? true,
      description: evt.description || "",
      events: [],
      status: "queued",
      commit: null,
      verdict: null,
    };
  }
  const t = taskMap[id];
  t.events.push({
    action: evt.action,
    at: evt.at,
    note: evt.note || "",
  });
  if (evt.status) t.status = evt.status;
  if (evt.commit) t.commit = evt.commit;
  if (evt.verdict) t.verdict = evt.verdict;
  if (evt.title) t.title = evt.title;
  if (evt.module) t.module = evt.module;
  if (evt.risk) t.risk = evt.risk;
  if (evt.task_type) t.task_type = evt.task_type;
  if (evt.description) t.description = evt.description;
}
const tasks = Object.values(taskMap);

// ---- Parse reviews ----
const reviews = readJSONL(join(rtDir, "reviews.jsonl"));

// ---- Parse modules ----
const modulesData = readJSON(join(rtDir, "modules.json"));

// ---- Parse migration ----
const migration = readJSON(join(rtDir, "migration.json"));

// ---- Parse project.md ----
const projectMd = readText(join(rtDir, "project.md"));

// ---- Parse handoffs ----
const handoffsDir = join(rtDir, "handoffs");
let handoffs = [];
try {
  const handoffFiles = readdirSync(handoffsDir).filter((f) => f.endsWith(".json"));
  handoffs = handoffFiles
    .map((f) => readJSON(join(handoffsDir, f)))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
} catch {
  handoffs = [];
}

// ---- Summary stats ----
const totalTasks = tasks.length;
const completedTasks = tasks.filter((t) => t.status === "completed").length;
const cancelledTasks = tasks.filter((t) => t.status === "cancelled").length;
const inReviewTasks = tasks.filter((t) => t.status === "review").length;
const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
const queuedTasks = tasks.filter((t) => t.status === "queued").length;

const totalReviews = reviews.length;
const approvedReviews = reviews.filter((r) => r.verdict === "approved").length;
const changesRequested = reviews.filter((r) => r.verdict === "changes_requested").length;

// Module-level stats
const moduleStats = (modulesData.modules || []).map((mod) => {
  const modTasks = tasks.filter((t) => t.module === mod.name);
  return {
    ...mod,
    total: modTasks.length,
    completed: modTasks.filter((t) => t.status === "completed").length,
    in_progress: modTasks.filter((t) => t.status === "in_progress").length,
    review: modTasks.filter((t) => t.status === "review").length,
    queued: modTasks.filter((t) => t.status === "queued").length,
    cancelled: modTasks.filter((t) => t.status === "cancelled").length,
        high_risk: modTasks.filter((t) => t.risk === "high" || t.risk === "critical").length,
  };
});

// Sort tasks by creation date descending
tasks.sort((a, b) => {
  const aTime = a.events[0]?.at || "";
  const bTime = b.events[0]?.at || "";
  return bTime.localeCompare(aTime);
});

// Sort reviews by date descending
reviews.sort((a, b) => (b.at || "").localeCompare(a.at || ""));

const output = {
  generated_at: new Date().toISOString(),
  summary: {
    total_tasks: totalTasks,
    completed: completedTasks,
    cancelled: cancelledTasks,
    in_review: inReviewTasks,
    in_progress: inProgressTasks,
    queued: queuedTasks,
    total_reviews: totalReviews,
    approved_reviews: approvedReviews,
    changes_requested: changesRequested,
    approval_rate: totalReviews > 0 ? Math.round((approvedReviews / totalReviews) * 100) : 0,
  },
  migration,
  project_md: projectMd,
  modules: moduleStats,
  tasks,
  reviews,
  handoffs,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
console.log(`[roundtable-viz] Generated ${outPath} (${tasks.length} tasks, ${reviews.length} reviews, ${handoffs.length} handoffs)`);
