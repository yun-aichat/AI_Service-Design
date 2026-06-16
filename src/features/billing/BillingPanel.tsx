import { Box, Button, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../account/AuthProvider";
import {
  BillingRequestError,
  getMyCreditAccount,
  listCreditPackages,
  listMyLedgerEntries,
  type CreditAccount,
  type CreditLedgerEntry,
  type CreditPackage,
  type PageResult,
} from "../../infrastructure/cloudbase/billing/api";
import { CreditBalanceCard } from "./CreditBalanceCard";
import { CreditPackageList } from "./CreditPackageList";
import { LedgerHistory } from "./LedgerHistory";

const LEDGER_PAGE_SIZE = 10;

export function BillingPanel() {
  const { session, loading: authLoading, error: authError } = useAuth();
  const [account, setAccount] = useState<CreditAccount | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [ledgerPage, setLedgerPage] = useState<PageResult<CreditLedgerEntry> | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerOffset, setLedgerOffset] = useState(0);

  const loadBillingData = useCallback(async () => {
    if (!session) return;
    setBillingLoading(true);
    setError(null);
    try {
      const [accountResult, packagesResult] = await Promise.all([
        getMyCreditAccount(),
        listCreditPackages({ limit: 20 }),
      ]);
      setAccount(accountResult);
      setPackages(packagesResult.items);
    } catch (reason) {
      setError(getErrorMessage(reason, "加载计费数据失败。"));
    } finally {
      setBillingLoading(false);
    }
  }, [session]);

  const loadLedgerPage = useCallback(async (offset: number) => {
    if (!session) return;
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const nextPage = await listMyLedgerEntries({
        limit: LEDGER_PAGE_SIZE,
        offset,
      });
      setLedgerPage(nextPage);
      setLedgerOffset(nextPage.page.offset);
    } catch (reason) {
      setLedgerError(getErrorMessage(reason, "加载账本历史失败。"));
    } finally {
      setLedgerLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void loadBillingData();
    void loadLedgerPage(0);
  }, [session, loadBillingData, loadLedgerPage]);

  if (authLoading) {
    return <LoadingCard message="正在恢复登录状态..." />;
  }

  if (!session) {
    return (
      <Box
        bg="bg.surface"
        borderColor="border.default"
        borderRadius="xl"
        borderWidth="1px"
        boxShadow="sm"
        p={{ base: "5", md: "8" }}
      >
        <Stack gap="4">
          <Box>
            <Text color="fg.muted" fontSize="xs" fontWeight="medium">BILLING</Text>
            <Heading fontSize="lg" mt="1">积分中心</Heading>
          </Box>
          <Text color="fg.muted" fontSize="sm">请先登录以查看积分余额、购买状态和账本历史。</Text>
          <Button
            alignSelf="start"
            onClick={() => { window.location.href = "/account"; }}
            size="sm"
            variant="outline"
          >
            前往登录
          </Button>
          {authError ? <Text color="status.errorFg" fontSize="sm">{authError}</Text> : null}
        </Stack>
      </Box>
    );
  }

  return (
    <Stack gap="6">
      <Box>
        <Text color="fg.muted" fontSize="xs" fontWeight="medium">BILLING</Text>
        <Heading fontSize="2xl" mt="1">积分中心</Heading>
        <Text color="fg.muted" fontSize="sm" mt="2">
          使用当前登录身份读取积分余额、可购买套餐、购买状态提示和账本历史。
        </Text>
      </Box>

      {error ? (
        <StatusCard
          action={
            <Button alignSelf="start" onClick={() => void loadBillingData()} size="sm" variant="outline">
              重试
            </Button>
          }
          borderColor="status.errorBorder"
          message={error}
          tone="status.errorFg"
        />
      ) : null}

      <Grid gap="6" templateColumns={{ base: "1fr", xl: "minmax(0, 1.4fr) minmax(320px, 0.9fr)" }}>
        <Stack gap="6">
          <CreditBalanceCard account={account} loading={billingLoading} />
          <LedgerHistory
            entries={ledgerPage?.items || []}
            error={ledgerError}
            loading={ledgerLoading}
            onNextPage={
              ledgerPage?.page.hasMore
                ? () => void loadLedgerPage(ledgerOffset + LEDGER_PAGE_SIZE)
                : null
            }
            onPreviousPage={
              ledgerOffset > 0
                ? () => void loadLedgerPage(Math.max(0, ledgerOffset - LEDGER_PAGE_SIZE))
                : null
            }
            onRetry={() => void loadLedgerPage(ledgerOffset)}
            page={ledgerPage?.page || null}
          />
        </Stack>

        <Stack gap="6">
          <CreditPackageList packages={packages} loading={billingLoading} />
          <Box
            bg="bg.surface"
            borderColor="border.default"
            borderRadius="xl"
            borderWidth="1px"
            boxShadow="sm"
            p="5"
          >
            <Stack gap="3">
              <Text color="fg.muted" fontSize="xs" fontWeight="medium">购买状态</Text>
              <Text fontSize="sm">
                当前前端只恢复了用户侧读取能力，在线下单和查单状态仍沿用服务端既有契约，页面暂不发起真实支付。
              </Text>
              <HStack align="start" color="fg.muted" fontSize="sm">
                <Text>已登录账号：</Text>
                <Text color="fg.default" fontWeight="medium">{session.user.email || session.user.phone || session.user.id}</Text>
              </HStack>
              {session.user.roles.some((role) => role === "admin" || role === "billing-admin") ? (
                <Button
                  alignSelf="start"
                  onClick={() => { window.location.href = "/admin/billing"; }}
                  size="sm"
                  variant="outline"
                >
                  打开 Billing Admin
                </Button>
              ) : null}
            </Stack>
          </Box>
        </Stack>
      </Grid>
    </Stack>
  );
}

function LoadingCard({ message }: { message: string }) {
  return (
    <Box
      bg="bg.surface"
      borderColor="border.default"
      borderRadius="xl"
      borderWidth="1px"
      boxShadow="sm"
      p={{ base: "5", md: "8" }}
    >
      <Text color="fg.muted">{message}</Text>
    </Box>
  );
}

function StatusCard({
  message,
  tone,
  borderColor,
  action,
}: {
  message: string;
  tone: string;
  borderColor: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      bg="bg.surface"
      borderColor={borderColor}
      borderRadius="lg"
      borderWidth="1px"
      gap="2"
      p="4"
    >
      <Text color={tone} fontSize="sm">{message}</Text>
      {action}
    </Stack>
  );
}

function getErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof BillingRequestError && reason.code === "UNAUTHENTICATED") {
    return "登录已失效，请重新登录后再查看积分。";
  }
  return reason instanceof Error ? reason.message : fallback;
}
