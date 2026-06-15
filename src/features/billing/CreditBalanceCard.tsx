import { Box, Grid, Skeleton, Stack, Text } from "@chakra-ui/react";
import type { CreditAccount } from "../../infrastructure/cloudbase/billing/api";

type CreditBalanceCardProps = {
  account: CreditAccount | null;
  loading: boolean;
};

export function CreditBalanceCard({ account, loading }: CreditBalanceCardProps) {
  return (
    <Box
      bg="bg.surface"
      borderColor="border.default"
      borderRadius="xl"
      borderWidth="1px"
      boxShadow="sm"
      overflow="hidden"
    >
      <Stack
        bg="brand.primary"
        color="brand.onPrimary"
        gap="1"
        px={{ base: "5", md: "6" }}
        py="5"
      >
        <Text fontSize="xs" fontWeight="medium" opacity={0.8}>可用积分</Text>
        {loading || !account ? (
          <Skeleton height="40px" width="120px" />
        ) : (
          <Text fontSize="display" fontWeight="semibold" lineHeight="tight">
            {account.availableCredits.toLocaleString()}
          </Text>
        )}
      </Stack>

      <Grid
        borderColor="border.subtle"
        borderTopWidth="1px"
        gridTemplateColumns={{ base: "1fr 1fr", md: "repeat(4, 1fr)" }}
      >
        <BalanceStat label="预占中" loading={loading} value={account?.reservedCredits} />
        <BalanceStat borderLeft label="已消耗" loading={loading} value={account?.consumedCredits} />
        <BalanceStat borderLeft label="累计发放" loading={loading} value={account?.totalIssuedCredits} />
        <BalanceStat borderLeft label="累计过期" loading={loading} value={account?.totalExpiredCredits} />
      </Grid>
    </Box>
  );
}

function BalanceStat({
  label,
  value,
  loading,
  borderLeft = false,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  borderLeft?: boolean;
}) {
  return (
    <Stack
      borderLeftColor="border.subtle"
      borderLeftWidth={borderLeft ? "1px" : "0"}
      gap="0"
      px="4"
      py="3"
    >
      <Text color="fg.muted" fontSize="xs">{label}</Text>
      {loading || value === undefined ? (
        <Skeleton height="24px" width="60px" mt="1" />
      ) : (
        <Text fontSize="title" fontWeight="medium" mt="0.5">
          {value.toLocaleString()}
        </Text>
      )}
    </Stack>
  );
}
