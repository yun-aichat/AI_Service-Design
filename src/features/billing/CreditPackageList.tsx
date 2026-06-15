import { Box, Flex, Skeleton, Stack, Text } from "@chakra-ui/react";
import type { CreditPackage } from "../../infrastructure/cloudbase/billing/api";

type CreditPackageListProps = {
  packages: CreditPackage[];
  loading: boolean;
};

export function CreditPackageList({ packages, loading }: CreditPackageListProps) {
  return (
    <Stack gap="3">
      <Text color="fg.muted" fontSize="xs" fontWeight="medium">积分套餐</Text>

      {loading ? (
        <Stack gap="3">
          {[1, 2, 3].map((i) => (
            <Skeleton borderRadius="lg" height="96px" key={i} />
          ))}
        </Stack>
      ) : packages.length === 0 ? (
        <Box
          bg="bg.surface"
          borderColor="border.default"
          borderRadius="lg"
          borderWidth="1px"
          p="4"
        >
          <Text color="fg.muted" fontSize="sm">暂无可购买的积分套餐。</Text>
        </Box>
      ) : (
        <Stack gap="3">
          {packages.map((pkg) => (
            <PackageCard key={pkg.packageId} pkg={pkg} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function PackageCard({ pkg }: { pkg: CreditPackage }) {
  const totalCredits = pkg.totalCredits ?? pkg.credits + pkg.bonusCredits;
  const hasBonus = pkg.bonusCredits > 0;

  return (
    <Box
      bg="bg.surface"
      borderColor="border.default"
      borderRadius="lg"
      borderWidth="1px"
      boxShadow="sm"
      overflow="hidden"
    >
      <Flex align="center" justify="space-between" p="4">
        <Stack gap="1" flex="1" minW="0">
          <Text fontSize="sm" fontWeight="medium">{pkg.displayName}</Text>
          <Flex align="baseline" gap="1">
            <Text fontSize="title" fontWeight="semibold">{totalCredits}</Text>
            <Text color="fg.muted" fontSize="xs">积分</Text>
            {hasBonus ? (
              <Text color="status.successFg" fontSize="xs" ml="1">
                +{pkg.bonusCredits} 赠送
              </Text>
            ) : null}
          </Flex>
          {pkg.description ? <Text color="fg.muted" fontSize="xs">{pkg.description}</Text> : null}
          {pkg.validityDays ? (
            <Text color="fg.subtle" fontSize="xs">有效期 {pkg.validityDays} 天</Text>
          ) : (
            <Text color="fg.subtle" fontSize="xs">长期有效</Text>
          )}
        </Stack>

        <Stack align="flex-end" gap="1" ml="4">
          <Text fontSize="title" fontWeight="semibold">
            {formatPrice(pkg.priceValue, pkg.currency)}
          </Text>
          <Text color={pkg.enabled ? "fg.subtle" : "status.warningFg"} fontSize="xs">
            {pkg.enabled ? "在线购买开发中" : "已下架"}
          </Text>
        </Stack>
      </Flex>
    </Box>
  );
}

function formatPrice(priceValue: number, currency: string) {
  const amount = priceValue / 100;
  if (currency === "CNY") return `¥${amount.toFixed(2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}
