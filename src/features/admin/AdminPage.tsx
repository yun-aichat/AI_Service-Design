import {
  Badge,
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "../account";
import { getCloudBaseAuthPort } from "../../infrastructure/cloudbase/auth/cloudbase-auth-port";
import {
  BillingConfigRequestError,
  debugAuthProfile,
  type BillingAuthProfile,
  listAiUsageEvents,
  listCreditLedger,
  type AiUsageEventRecord,
  type BillingPage,
  type CreditLedgerRecord,
} from "./api";
import { AdminAuthGate } from "./AdminAuthGate";

const LEDGER_LABELS: Record<string, string> = {
  purchase: "购买",
  grant: "赠送",
  reserve: "预占",
  commit: "确认",
  release: "释放",
  refund: "退款",
  adjustment: "调整",
  expire: "过期",
};

const STATUS_LABELS: Record<string, string> = {
  started: "进行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "取消",
};

export default function AdminPage() {
  let auth;
  try {
    auth = getCloudBaseAuthPort();
  } catch (reason) {
    const message =
      reason instanceof Error ? reason.message : "CloudBase 账号认证配置无效。";
    return (
      <PageShell>
        <StateBlock title="后台不可用" message={message} />
      </PageShell>
    );
  }

  return (
    <AuthProvider auth={auth}>
      <AdminAuthGate>
        <AdminBillingConsole />
      </AdminAuthGate>
    </AuthProvider>
  );
}

function AdminBillingConsole() {
  const { session } = useAuth();
  const [ledgerPage, setLedgerPage] = useState<BillingPage<CreditLedgerRecord> | null>(null);
  const [usagePage, setUsagePage] = useState<BillingPage<AiUsageEventRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [serverAuthProfile, setServerAuthProfile] = useState<BillingAuthProfile["user"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(false);
    setServerAuthProfile(null);
    try {
      const [ledger, usage] = await Promise.all([
        listCreditLedger({ limit: 100, sortBy: "createdAt", sortDirection: "desc" }),
        listAiUsageEvents({ limit: 100, sortBy: "createdAt", sortDirection: "desc" }),
      ]);
      setLedgerPage(ledger);
      setUsagePage(usage);
    } catch (reason) {
      if (reason instanceof BillingConfigRequestError && reason.code === "FORBIDDEN") {
        setAccessDenied(true);
        try {
          const debugProfile = await debugAuthProfile();
          setServerAuthProfile(debugProfile.user);
        } catch {
          setServerAuthProfile(null);
        }
      }
      setError(getErrorMessage(reason, "加载 billing 管理数据失败。"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const usageItems = usagePage?.items || [];
    const ledgerItems = ledgerPage?.items || [];
    const succeededUsage = usageItems.filter((item) => item.status === "succeeded");
    const failedUsage = usageItems.filter((item) => item.status === "failed");

    return {
      usageCount: usageItems.length,
      ledgerCount: ledgerItems.length,
      succeededCount: succeededUsage.length,
      failedCount: failedUsage.length,
      totalTokens: usageItems.reduce((sum, item) => sum + (item.totalTokens || 0), 0),
      totalEstimatedCost: usageItems.reduce(
        (sum, item) => sum + (item.estimatedCostValue || 0),
        0,
      ),
      chargedCredits: usageItems.reduce((sum, item) => sum + item.chargedCredits, 0),
    };
  }, [ledgerPage, usagePage]);

  if (accessDenied) {
    return (
      <PageShell>
        <StateBlock
          title="无访问权限"
          message={error || "当前账号已登录，但 CloudBase 后端未授予 billing admin 权限。"}
          details={[
            `前端会话: id=${session?.user.id || "-"}, phone=${session?.user.phone || "-"}, roles=${formatRoles(session?.user.roles)}`,
            serverAuthProfile
              ? `服务端识别: id=${serverAuthProfile.id}, phone=${serverAuthProfile.phone || "-"}, roles=${formatRoles(serverAuthProfile.roles)}`
              : "服务端识别: 暂未获取到调试资料",
          ]}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Stack gap="6">
        <Box>
          <HStack align="center" gap="3">
            <Heading fontSize="2xl">Billing Admin</Heading>
            <Badge colorPalette="green" variant="subtle">正式数据源</Badge>
          </HStack>
          <Text color="fg.muted" fontSize="sm" mt="2">
            只读查看 admin access、AI usage/cost 和 credit ledger 的正式读链路。
          </Text>
          <Text color="fg.muted" fontSize="xs" mt="1">
            当前账号：{session?.user.email || session?.user.phone || session?.user.id}
          </Text>
        </Box>

        <HStack gap="3">
          <Button onClick={() => void load()} size="sm" variant="outline">
            刷新
          </Button>
          <Button onClick={() => { window.location.href = "/billing"; }} size="sm" variant="ghost">
            返回积分中心
          </Button>
        </HStack>

        {error ? <StateBlock title="读取失败" message={error} /> : null}

        <Grid gap="4" templateColumns={{ base: "1fr 1fr", xl: "repeat(4, 1fr)" }}>
          <StatCard label="Usage 记录" value={String(stats.usageCount)} />
          <StatCard label="成功 / 失败" value={`${stats.succeededCount} / ${stats.failedCount}`} />
          <StatCard label="账本记录" value={String(stats.ledgerCount)} />
          <StatCard label="累计 Token" value={stats.totalTokens.toLocaleString()} />
        </Grid>

        <Grid gap="4" templateColumns={{ base: "1fr", xl: "1fr 1fr" }}>
          <StatCard label="估算成本" value={stats.totalEstimatedCost.toFixed(4)} />
          <StatCard label="累计积分计费" value={String(stats.chargedCredits)} />
        </Grid>

        <Panel title="AI Usage / Cost" subtitle="基于 ai_usage_events 读取模型用量、状态与估算成本。">
          {loading ? (
            <Text color="fg.muted">加载中...</Text>
          ) : !usagePage || usagePage.items.length === 0 ? (
            <Text color="fg.muted" fontSize="sm">暂无 AI usage 数据。</Text>
          ) : (
            <>
              <DataTable
                headers={["时间", "工具", "动作", "供应商 / 模型", "Tokens", "积分", "状态", "引用"]}
                rows={usagePage.items.slice(0, 30).map((event) => [
                  formatDate(event.createdAt),
                  mono(event.toolKey),
                  mono(`${event.actionKey}/${event.tierKey}`),
                  `${event.provider} / ${event.model}`,
                  String(event.totalTokens ?? "-"),
                  String(event.chargedCredits),
                  STATUS_LABELS[event.status] || event.status,
                  mono(event.referenceId),
                ])}
              />
              <Text color="fg.muted" fontSize="xs">
                共 {usagePage.page.total} 条记录，当前展示最新 {Math.min(usagePage.items.length, 30)} 条。
              </Text>
            </>
          )}
        </Panel>

        <Panel title="Credit Ledger" subtitle="基于 credit_ledger 读取积分账本，覆盖 purchase / reserve / commit / release 等正式事件。">
          {loading ? (
            <Text color="fg.muted">加载中...</Text>
          ) : !ledgerPage || ledgerPage.items.length === 0 ? (
            <Text color="fg.muted" fontSize="sm">暂无积分账本数据。</Text>
          ) : (
            <>
              <DataTable
                headers={["时间", "操作", "账户", "积分", "可用变动", "预占变动", "已用变动", "引用"]}
                rows={ledgerPage.items.slice(0, 30).map((entry) => [
                  formatDate(entry.createdAt),
                  LEDGER_LABELS[entry.operation] || entry.operation,
                  mono(entry.accountId),
                  String(entry.credits),
                  withSign(entry.availableDelta),
                  withSign(entry.reservedDelta),
                  withSign(entry.consumedDelta),
                  mono(`${entry.referenceType}:${entry.referenceId}`),
                ])}
              />
              <Text color="fg.muted" fontSize="xs">
                共 {ledgerPage.page.total} 条记录，当前展示最新 {Math.min(ledgerPage.items.length, 30)} 条。
              </Text>
            </>
          )}
        </Panel>
      </Stack>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <Box bg="bg.canvas" minH="100vh" py={{ base: "8", md: "12" }}>
      <Stack maxW="7xl" mx="auto" px={{ base: "5", md: "8" }}>
        {children}
      </Stack>
    </Box>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Stack
      bg="bg.surface"
      borderColor="border.default"
      borderRadius="xl"
      borderWidth="1px"
      gap="4"
      p="5"
    >
      <Box>
        <Heading fontSize="lg">{title}</Heading>
        <Text color="fg.muted" fontSize="sm" mt="1">{subtitle}</Text>
      </Box>
      {children}
    </Stack>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      bg="bg.surface"
      borderColor="border.default"
      borderRadius="xl"
      borderWidth="1px"
      gap="1"
      p="4"
    >
      <Text color="fg.muted" fontSize="xs">{label}</Text>
      <Text fontSize="2xl" fontWeight="semibold">{value}</Text>
    </Stack>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <Box overflowX="auto">
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            {headers.map((header) => (
              <Table.ColumnHeader key={header}>{header}</Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, index) => (
            <Table.Row key={index}>
              {row.map((cell, cellIndex) => (
                <Table.Cell key={`${index}-${cellIndex}`}>{cell}</Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

function StateBlock({
  title,
  message,
  details,
}: {
  title: string;
  message: string;
  details?: string[];
}) {
  return (
    <Stack
      bg="bg.surface"
      borderColor="status.errorBorder"
      borderRadius="xl"
      borderWidth="1px"
      gap="2"
      p="5"
    >
      <Heading fontSize="lg">{title}</Heading>
      <Text color="status.errorFg" fontSize="sm">{message}</Text>
      {details?.map((detail) => (
        <Text color="fg.muted" fontFamily="mono" fontSize="xs" key={detail}>
          {detail}
        </Text>
      ))}
    </Stack>
  );
}

function mono(value: string) {
  return (
    <Text fontFamily="mono" fontSize="xs">
      {value}
    </Text>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function withSign(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatRoles(roles: string[] | null | undefined) {
  return Array.isArray(roles) && roles.length > 0 ? roles.join(",") : "(empty)";
}

function getErrorMessage(reason: unknown, fallback: string) {
  if (
    reason instanceof BillingConfigRequestError &&
    reason.code === "CLOUDBASE_DATABASE_UNAVAILABLE"
  ) {
    return "服务端 billing-config 尚未拿到 CloudBase database client，正式读链路未初始化。";
  }
  if (reason instanceof BillingConfigRequestError && reason.code === "FORBIDDEN") {
    return "当前账号已登录，但没有 billing admin 权限。";
  }
  return reason instanceof Error ? reason.message : fallback;
}
