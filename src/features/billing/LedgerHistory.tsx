import { Box, Button, Flex, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import type { CreditLedgerEntry, PageResult } from "../../infrastructure/cloudbase/billing/api";

type LedgerHistoryProps = {
  entries: CreditLedgerEntry[];
  error: string | null;
  loading: boolean;
  onNextPage: (() => void) | null;
  onPreviousPage: (() => void) | null;
  onRetry: () => void;
  page: PageResult<CreditLedgerEntry>["page"] | null;
};

const OPERATION_LABELS: Record<string, string> = {
  purchase: "购买入账",
  grant: "赠送",
  reserve: "预占",
  commit: "消耗",
  release: "释放",
  refund: "退款",
  adjustment: "调整",
  expire: "过期",
};

const OPERATION_COLORS: Record<string, string> = {
  purchase: "status.successFg",
  grant: "status.successFg",
  reserve: "fg.muted",
  commit: "status.warningFg",
  release: "status.infoFg",
  refund: "status.infoFg",
  adjustment: "fg.muted",
  expire: "status.errorFg",
};

export function LedgerHistory({
  entries,
  error,
  loading,
  onNextPage,
  onPreviousPage,
  onRetry,
  page,
}: LedgerHistoryProps) {
  return (
    <Stack gap="3">
      <Flex align="center" justify="space-between" gap="4">
        <Text color="fg.muted" fontSize="xs" fontWeight="medium">账本历史</Text>
        {page ? (
          <Text color="fg.subtle" fontSize="xs">
            {page.total === 0 ? "0 / 0" : `${page.offset + 1}-${page.offset + entries.length} / ${page.total}`}
          </Text>
        ) : null}
      </Flex>

      {loading ? (
        <Stack gap="2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton borderRadius="md" height="56px" key={i} />
          ))}
        </Stack>
      ) : error ? (
        <Box
          bg="status.errorSurface"
          borderColor="status.errorBorder"
          borderRadius="lg"
          borderWidth="1px"
          p="4"
        >
          <Stack gap="3">
            <Text color="status.errorFg" fontSize="sm">{error}</Text>
            <Button alignSelf="start" onClick={onRetry} size="sm" variant="outline">
              重试
            </Button>
          </Stack>
        </Box>
      ) : entries.length === 0 ? (
        <Box
          bg="bg.surface"
          borderColor="border.default"
          borderRadius="lg"
          borderWidth="1px"
          p="4"
        >
          <Text color="fg.muted" fontSize="sm">暂无账本历史。</Text>
        </Box>
      ) : (
        <>
          <Box
            bg="bg.surface"
            borderColor="border.default"
            borderRadius="lg"
            borderWidth="1px"
            boxShadow="sm"
            overflow="hidden"
          >
            {entries.map((entry, index) => (
              <LedgerRow entry={entry} key={entry.id} isLast={index === entries.length - 1} />
            ))}
          </Box>
          <HStack justify="space-between">
            <Button disabled={!onPreviousPage} onClick={onPreviousPage || undefined} size="sm" variant="outline">
              上一页
            </Button>
            <Button disabled={!onNextPage} onClick={onNextPage || undefined} size="sm" variant="outline">
              下一页
            </Button>
          </HStack>
        </>
      )}
    </Stack>
  );
}

function LedgerRow({ entry, isLast }: { entry: CreditLedgerEntry; isLast: boolean }) {
  const label = OPERATION_LABELS[entry.operation] || entry.operation;
  const color = OPERATION_COLORS[entry.operation] || "fg.default";
  const delta = entry.availableDelta !== 0 ? entry.availableDelta : entry.consumedDelta !== 0 ? -entry.consumedDelta : entry.reservedDelta;
  const sign = delta > 0 ? "+" : "";
  const date = formatDate(entry.createdAt);

  return (
    <Flex
      align="center"
      borderBottomColor="border.subtle"
      borderBottomWidth={isLast ? "0" : "1px"}
      gap="3"
      px="4"
      py="3"
    >
      <Stack flex="1" gap="0" minW="0">
        <Text color={color} fontSize="sm" fontWeight="medium">{label}</Text>
        <Text color="fg.subtle" fontSize="xs" lineClamp="1">
          {entry.referenceType}:{entry.referenceId}
        </Text>
      </Stack>
      <Stack align="flex-end" gap="0">
        <Text
          color={delta >= 0 ? "status.successFg" : "status.errorFg"}
          fontSize="sm"
          fontWeight="medium"
        >
          {sign}{delta}
        </Text>
        <Text color="fg.subtle" fontSize="xs">{date}</Text>
      </Stack>
    </Flex>
  );
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}
