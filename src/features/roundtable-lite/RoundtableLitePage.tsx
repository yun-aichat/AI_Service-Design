import { Box, Card, Heading, Text, Badge, Table, Tabs, Flex, Container, Separator } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import data from "./data.json";

/* ---------- helpers ---------- */
const STATUS_COLOR: Record<string, string> = {
  completed: "green", in_progress: "blue", review: "orange", queued: "gray", cancelled: "red",
};
const STATUS_LABEL: Record<string, string> = {
  completed: "已完成", in_progress: "进行中", review: "审查中", queued: "排队中", cancelled: "已取消",
};
const ACTION_LABEL: Record<string, string> = {
  create: "创建", start: "开始", submit: "提交审查", review: "审查结果", cancel: "取消",
};
const RISK_COLOR: Record<string, string> = {
  low: "green", normal: "blue", high: "orange", critical: "red",
};
const MODULE_COLORS = ["blue", "purple", "teal", "orange", "pink", "cyan"];

function formatDate(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatFullDate(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortHash(hash: string | null) {
  if (!hash) return "-";
  return hash.slice(0, 7);
}

/* ---------- shared components ---------- */

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <Card.Root size="sm" variant="outline" flex="1" minW="120px">
      <Card.Body p="3">
        <Text color="fg.muted" fontSize="xs" fontWeight="medium">{label}</Text>
        <Text fontSize="2xl" fontWeight="bold" color={`${color}.solid`} mt="1">{value}</Text>
      </Card.Body>
    </Card.Root>
  );
}

function ModuleCard({ mod, idx, onSelect, selected }: {
  mod: (typeof data.modules)[0]; idx: number;
  onSelect: (name: string | null) => void; selected: boolean;
}) {
  const color = MODULE_COLORS[idx % MODULE_COLORS.length];
  const total = mod.total || 0;
  const completed = mod.completed || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <Card.Root size="sm" variant="outline" cursor="pointer" flex="1" minW="200px"
      borderColor={selected ? `${color}.solid` : "border"}
      borderWidth={selected ? "2px" : "1px"}
      onClick={() => onSelect(selected ? null : mod.name)}
      _hover={{ borderColor: `${color}.solid` }}>
      <Card.Body p="4">
        <Flex justify="space-between" align="center" mb="2">
          <Badge colorPalette={color} variant="subtle" size="sm">{mod.display_name}</Badge>
          <Text fontSize="xs" color="fg.muted">{pct}%</Text>
        </Flex>
        <Box w="full" h="6px" bg="bg.muted" borderRadius="full" overflow="hidden" mb="2">
          <Box w={`${pct}%`} h="full" bg={`${color}.solid`} borderRadius="full" transition="width 0.3s" />
        </Box>
        <Flex gap="3" fontSize="xs" color="fg.muted" wrap="wrap">
          <Text>总 {total}</Text>
          <Text color="green.fg">完成 {completed}</Text>
          {mod.in_progress > 0 && <Text color="blue.fg">进行 {mod.in_progress}</Text>}
          {mod.review > 0 && <Text color="orange.fg">审查 {mod.review}</Text>}
          {mod.cancelled > 0 && <Text color="red.fg">取消 {mod.cancelled}</Text>}
          {mod.high_risk > 0 && <Text color="orange.fg">高风险 {mod.high_risk}</Text>}
        </Flex>
      </Card.Body>
    </Card.Root>
  );
}

/* ---------- expandable task row ---------- */

function TaskRow({ task, idx, modules }: { task: (typeof data.tasks)[0]; idx: number; modules: typeof data.modules }) {
  const [expanded, setExpanded] = useState(false);
  const firstEvent = task.events[0];
  const lastEvent = task.events[task.events.length - 1];
  const modIdx = modules.findIndex(m => m.name === task.module);
  const modColor = MODULE_COLORS[(modIdx + MODULE_COLORS.length) % MODULE_COLORS.length] || "gray";

  return (
    <>
      <Table.Row
        key={task.task_id}
        bg={idx % 2 === 0 ? "bg.subtle" : undefined}
        cursor="pointer"
        _hover={{ bg: "bg.emphasized" }}
        onClick={() => setExpanded(!expanded)}
        title="点击展开事件时间线"
      >
        <Table.Cell maxW="300px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          <Text fontSize="sm" fontWeight="medium">{task.title}</Text>
        </Table.Cell>
        <Table.Cell><Badge size="sm" variant="subtle" colorPalette={modColor}>{task.module}</Badge></Table.Cell>
        <Table.Cell><Badge size="sm" colorPalette={STATUS_COLOR[task.status] || "gray"}>{STATUS_LABEL[task.status] || task.status}</Badge></Table.Cell>
        <Table.Cell><Badge size="sm" colorPalette={RISK_COLOR[task.risk] || "gray"} variant="outline">{task.risk}</Badge></Table.Cell>
        <Table.Cell fontSize="xs" color="fg.muted">{task.task_type}</Table.Cell>
        <Table.Cell fontSize="xs" fontFamily="mono">{shortHash(task.commit)}</Table.Cell>
        <Table.Cell fontSize="xs" color="fg.muted">{formatDate(firstEvent?.at)}</Table.Cell>
        <Table.Cell fontSize="xs" color="fg.muted">{formatDate(lastEvent?.at)}</Table.Cell>
      </Table.Row>
      {expanded && (
        <Table.Row>
          <Table.Cell colSpan={8} p="0">
            <Box px="4" py="3" bg="bg.subtle" borderBottomWidth="1px" borderColor="border">
              {task.description && (
                <Text fontSize="xs" color="fg.muted" mb="2" fontStyle="italic">{task.description}</Text>
              )}
              <Flex direction="column" gap="1">
                {task.events.map((evt, i) => (
                  <Flex key={i} gap="3" fontSize="xs" align="baseline">
                    <Text color="fg.muted" minW="70px" textAlign="right">{ACTION_LABEL[evt.action] || evt.action}</Text>
                    <Text fontFamily="mono" color="fg.muted" minW="140px">{formatFullDate(evt.at)}</Text>
                    {evt.note && <Text color="fg.muted" fontStyle="italic" flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{evt.note}</Text>}
                  </Flex>
                ))}
              </Flex>
            </Box>
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

/* ---------- review row ---------- */

function ReviewRow({ review, idx }: { review: (typeof data.reviews)[0]; idx: number }) {
  const shortText = review.comments?.slice(0, 120) + (review.comments?.length > 120 ? "..." : "");
  return (
    <Table.Row key={review.review_id} bg={idx % 2 === 0 ? "bg.subtle" : undefined}>
      <Table.Cell fontSize="xs" fontFamily="mono">{review.task_id?.slice(-12)}</Table.Cell>
      <Table.Cell><Badge size="sm" colorPalette={review.verdict === "approved" ? "green" : "red"}>{review.verdict === "approved" ? "通过" : "需修改"}</Badge></Table.Cell>
      <Table.Cell fontSize="xs">{review.reviewer}</Table.Cell>
      <Table.Cell fontSize="xs" color="fg.muted">{formatDate(review.at)}</Table.Cell>
      <Table.Cell fontSize="xs" maxW="400px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={review.comments}>
        {shortText}
      </Table.Cell>
    </Table.Row>
  );
}

/* ---------- handoff row ---------- */

function HandoffRow({ ho, idx }: { ho: (typeof data.handoffs)[0]; idx: number }) {
  return (
    <Table.Row bg={idx % 2 === 0 ? "bg.subtle" : undefined}>
      <Table.Cell fontSize="xs" fontFamily="mono">{ho.id?.slice(-12)}</Table.Cell>
      <Table.Cell fontSize="xs">{ho.from}</Table.Cell>
      <Table.Cell fontSize="xs">{ho.to}</Table.Cell>
      <Table.Cell fontSize="xs">{ho.status}</Table.Cell>
      <Table.Cell fontSize="xs" color="fg.muted">{formatDate(ho.at)}</Table.Cell>
      <Table.Cell maxW="300px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={ho.message} fontSize="xs">
        {ho.message}
      </Table.Cell>
      {ho.resolution && (
        <Table.Cell maxW="200px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={ho.resolution} fontSize="xs" color="fg.muted">
          {ho.resolution}
        </Table.Cell>
      )}
      {!ho.resolution && <Table.Cell fontSize="xs" color="fg.muted">-</Table.Cell>}
    </Table.Row>
  );
}

/* ---------- project.md parser ---------- */

function ProjectMemory({ md }: { md: string }) {
  const sections = useMemo(() => {
    const result: { heading: string; body: string }[] = [];
    const lines = md.split("\n");
    let currentHeading = "";
    let currentBody: string[] = [];
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (currentHeading) result.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
        currentHeading = line.slice(3);
        currentBody = [];
      } else if (currentHeading) {
        currentBody.push(line);
      }
    }
    if (currentHeading) result.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
    return result;
  }, [md]);

  return (
    <Flex direction="column" gap="4">
      {sections.map((sec, i) => (
        <Card.Root key={i} size="sm" variant="outline">
          <Card.Body p="4">
            <Heading size="sm" mb="2">{sec.heading}</Heading>
            <Text fontSize="sm" whiteSpace="pre-wrap" color="fg.muted" lineHeight="1.7">
              {sec.body}
            </Text>
          </Card.Body>
        </Card.Root>
      ))}
    </Flex>
  );
}

/* ---------- page ---------- */

export default function RoundtableLitePage() {
  const [tab, setTab] = useState<string>("dashboard");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);

  const { summary, modules, tasks, reviews, migration, project_md, handoffs } = data as typeof data & { handoffs: typeof data.handoffs };

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (statusFilter) result = result.filter((t) => t.status === statusFilter);
    if (moduleFilter) result = result.filter((t) => t.module === moduleFilter);
    return result;
  }, [tasks, statusFilter, moduleFilter]);

  const sortedModules = useMemo(() => [...modules].sort((a, b) => b.total - a.total), [modules]);
  const recentReviews = useMemo(() => reviews.slice(0, 20), [reviews]);

  return (
    <Box h="100vh" overflowY="auto" bg="bg" color="fg">
      {/* header */}
      <Box borderBottomWidth="1px" borderColor="border" px="6" py="4">
        <Flex align="center" gap="3" mb="1">
          <Heading size="lg">Roundtable Lite</Heading>
          <Badge colorPalette="purple" variant="solid" size="sm">项目管理仪表盘</Badge>
        </Flex>
        <Text fontSize="sm" color="fg.muted">
          数据源迁移自 {migration.source_name} · 迁移时间 {formatDate(migration.migrated_at)} · 生成时间 {formatDate(data.generated_at)}
        </Text>
      </Box>

      <Container maxW="1400px" py="6">

        {/* ---- summary cards ---- */}
        <Flex gap="3" wrap="wrap" mb="6">
          <StatCard label="任务总数" value={summary.total_tasks} color="purple" />
          <StatCard label="已完成" value={summary.completed} color="green" />
          <StatCard label="审查中" value={summary.in_review} color="orange" />
          <StatCard label="进行中" value={summary.in_progress} color="blue" />
          <StatCard label="排队中" value={summary.queued} color="gray" />
          <StatCard label="已取消" value={summary.cancelled} color="red" />
          <StatCard label="审查通过率" value={`${summary.approval_rate}%`} color={summary.approval_rate >= 80 ? "green" : "orange"} />
        </Flex>

        {/* ---- module cards ---- */}
        <Heading size="md" mb="3">模块概览</Heading>
        <Flex gap="3" wrap="wrap" mb="6">
          {sortedModules.map((mod, i) => (
            <ModuleCard key={mod.name} mod={mod} idx={i} onSelect={setModuleFilter} selected={moduleFilter === mod.name} />
          ))}
        </Flex>

        <Separator mb="6" />

        {/* ---- tabs ---- */}
        <Tabs.Root value={tab} onValueChange={(e) => setTab(e.value)} mb="6">
          <Tabs.List>
            <Tabs.Trigger value="dashboard">仪表盘</Tabs.Trigger>
            <Tabs.Trigger value="tasks">任务列表</Tabs.Trigger>
            <Tabs.Trigger value="reviews">审查记录</Tabs.Trigger>
            <Tabs.Trigger value="handoffs">模块交接</Tabs.Trigger>
            <Tabs.Trigger value="project">项目记忆</Tabs.Trigger>
          </Tabs.List>

          {/* ====== dashboard ====== */}
          <Tabs.Content value="dashboard" pt="4">
            <Heading size="sm" mb="3">任务状态分布</Heading>
            <Flex gap="1" h="24px" borderRadius="md" overflow="hidden" mb="4">
              {summary.completed > 0 && <Box flex={summary.completed} bg="green.solid" title={`已完成 ${summary.completed}`} />}
              {summary.in_progress > 0 && <Box flex={summary.in_progress} bg="blue.solid" title={`进行中 ${summary.in_progress}`} />}
              {summary.in_review > 0 && <Box flex={summary.in_review} bg="orange.solid" title={`审查中 ${summary.in_review}`} />}
              {summary.queued > 0 && <Box flex={summary.queued} bg="gray.solid" title={`排队中 ${summary.queued}`} />}
              {summary.cancelled > 0 && <Box flex={summary.cancelled} bg="red.solid" title={`已取消 ${summary.cancelled}`} />}
            </Flex>
            <Flex gap="4" fontSize="xs" color="fg.muted" mb="6" wrap="wrap">
              {[
                ["green.solid", "已完成", summary.completed],
                ["blue.solid", "进行中", summary.in_progress],
                ["orange.solid", "审查中", summary.in_review],
                ["gray.solid", "排队中", summary.queued],
                ["red.solid", "已取消", summary.cancelled],
              ].map(([bg, label, val]) => (
                <Flex key={label} align="center" gap="1"><Box w="10px" h="10px" bg={bg} borderRadius="sm" /> {label} {val}</Flex>
              ))}
            </Flex>

            <Heading size="sm" mb="3">审查结论分布</Heading>
            <Flex gap="1" h="24px" borderRadius="md" overflow="hidden" mb="4">
              {summary.approved_reviews > 0 && <Box flex={summary.approved_reviews} bg="green.solid" title={`通过 ${summary.approved_reviews}`} />}
              {summary.changes_requested > 0 && <Box flex={summary.changes_requested} bg="red.solid" title={`需修改 ${summary.changes_requested}`} />}
            </Flex>
            <Flex gap="4" fontSize="xs" color="fg.muted" mb="6" wrap="wrap">
              <Flex align="center" gap="1"><Box w="10px" h="10px" bg="green.solid" borderRadius="sm" /> 通过 {summary.approved_reviews}</Flex>
              <Flex align="center" gap="1"><Box w="10px" h="10px" bg="red.solid" borderRadius="sm" /> 需修改 {summary.changes_requested}</Flex>
            </Flex>

            <Heading size="sm" mb="3">最近任务活动</Heading>
            <Box maxH="360px" overflowY="auto" borderRadius="md" borderWidth="1px" borderColor="border">
              <Table.Root size="sm" variant="outline" mb="0">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>任务</Table.ColumnHeader>
                    <Table.ColumnHeader>模块</Table.ColumnHeader>
                    <Table.ColumnHeader>状态</Table.ColumnHeader>
                    <Table.ColumnHeader>最后事件</Table.ColumnHeader>
                    <Table.ColumnHeader>时间</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {tasks.slice(0, 8).map((task, i) => {
                    const lastEvt = task.events[task.events.length - 1];
                    const modIdx = modules.findIndex(m => m.name === task.module);
                    const modColor = MODULE_COLORS[(modIdx + MODULE_COLORS.length) % MODULE_COLORS.length] || "gray";
                    return (
                      <Table.Row key={task.task_id} bg={i % 2 === 0 ? "bg.subtle" : undefined}>
                        <Table.Cell maxW="240px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={task.title}>
                          <Text fontSize="sm">{task.title}</Text>
                        </Table.Cell>
                        <Table.Cell><Badge size="sm" variant="subtle" colorPalette={modColor}>{task.module}</Badge></Table.Cell>
                        <Table.Cell><Badge size="sm" colorPalette={STATUS_COLOR[task.status]}>{STATUS_LABEL[task.status]}</Badge></Table.Cell>
                        <Table.Cell fontSize="xs" color="fg.muted">{ACTION_LABEL[lastEvt?.action] || lastEvt?.action}</Table.Cell>
                        <Table.Cell fontSize="xs" color="fg.muted">{formatDate(lastEvt?.at)}</Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table.Root>
            </Box>
          </Tabs.Content>

          {/* ====== tasks ====== */}
          <Tabs.Content value="tasks" pt="4">
            <Flex gap="2" mb="4" wrap="wrap">
              <Text fontSize="sm" color="fg.muted" alignSelf="center">筛选:</Text>
              {["completed", "in_progress", "review", "queued", "cancelled"].map((s) => (
                <Badge key={s} size="sm" colorPalette={STATUS_COLOR[s]} variant={statusFilter === s ? "solid" : "outline"}
                  cursor="pointer" onClick={() => setStatusFilter(statusFilter === s ? null : s)}>
                  {STATUS_LABEL[s]}
                </Badge>
              ))}
              <Badge size="sm" colorPalette="gray" variant={!statusFilter && !moduleFilter ? "solid" : "outline"}
                cursor="pointer" onClick={() => { setStatusFilter(null); setModuleFilter(null); }}>
                全部 ({tasks.length})
              </Badge>
              {moduleFilter && (
                <Badge size="sm" colorPalette="purple" variant="solid">
                  模块: {modules.find(m => m.name === moduleFilter)?.display_name || moduleFilter}
                  <Text as="span" ml="1" cursor="pointer" onClick={() => setModuleFilter(null)}>x</Text>
                </Badge>
              )}
            </Flex>

            <Box maxH="480px" overflowY="auto" borderRadius="md" borderWidth="1px" borderColor="border">
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>任务名称</Table.ColumnHeader>
                    <Table.ColumnHeader>模块</Table.ColumnHeader>
                    <Table.ColumnHeader>状态</Table.ColumnHeader>
                    <Table.ColumnHeader>风险</Table.ColumnHeader>
                    <Table.ColumnHeader>类型</Table.ColumnHeader>
                    <Table.ColumnHeader>Commit</Table.ColumnHeader>
                    <Table.ColumnHeader>创建</Table.ColumnHeader>
                    <Table.ColumnHeader>最近更新</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredTasks.map((task, i) => (
                    <TaskRow key={task.task_id} task={task} idx={i} modules={modules} />
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
            <Text fontSize="xs" color="fg.muted" mt="2">
              共 {filteredTasks.length} 个任务 · 点击行展开事件时间线
            </Text>
          </Tabs.Content>

          {/* ====== reviews ====== */}
          <Tabs.Content value="reviews" pt="4">
            <Text fontSize="sm" color="fg.muted" mb="4">最近 {recentReviews.length} 条审查记录（共 {reviews.length} 条）</Text>
            <Box maxH="480px" overflowY="auto" borderRadius="md" borderWidth="1px" borderColor="border">
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>任务 ID</Table.ColumnHeader>
                    <Table.ColumnHeader>结论</Table.ColumnHeader>
                    <Table.ColumnHeader>审查者</Table.ColumnHeader>
                    <Table.ColumnHeader>时间</Table.ColumnHeader>
                    <Table.ColumnHeader>评论</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {recentReviews.map((r, i) => (
                    <ReviewRow key={r.review_id} review={r} idx={i} />
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Tabs.Content>

          {/* ====== handoffs ====== */}
          <Tabs.Content value="handoffs" pt="4">
            <Text fontSize="sm" color="fg.muted" mb="4">共 {handoffs.length} 条模块交接记录</Text>
            <Box maxH="480px" overflowY="auto" borderRadius="md" borderWidth="1px" borderColor="border">
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>ID</Table.ColumnHeader>
                    <Table.ColumnHeader>从</Table.ColumnHeader>
                    <Table.ColumnHeader>至</Table.ColumnHeader>
                    <Table.ColumnHeader>状态</Table.ColumnHeader>
                    <Table.ColumnHeader>时间</Table.ColumnHeader>
                    <Table.ColumnHeader>消息</Table.ColumnHeader>
                    <Table.ColumnHeader>决议</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {handoffs.map((ho, i) => (
                    <HandoffRow key={ho.id} ho={ho} idx={i} />
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Tabs.Content>

          {/* ====== project memory ====== */}
          <Tabs.Content value="project" pt="4">
            <Box maxH="520px" overflowY="auto" pr="1">
              <ProjectMemory md={project_md} />
            </Box>
          </Tabs.Content>
        </Tabs.Root>
      </Container>
    </Box>
  );
}
