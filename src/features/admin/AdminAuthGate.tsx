import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useAuth } from "../account/AuthProvider";
import { canEnterAdminConsole } from "./admin-access";

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { session, loading, error } = useAuth();

  if (loading) {
    return (
      <Box bg="bg.canvas" minH="100vh" py="12">
        <Stack maxW="3xl" mx="auto" px="6">
          <Text color="fg.muted">正在验证管理员身份...</Text>
        </Stack>
      </Box>
    );
  }

  if (!session) {
    return (
      <StateCard
        title="需要登录"
        message={error || "Billing 管理后台需要先登录。"}
        action={
          <Button alignSelf="start" onClick={() => { window.location.href = "/account"; }} size="sm" variant="outline">
            前往登录
          </Button>
        }
      />
    );
  }

  if (!canEnterAdminConsole({ hasSession: Boolean(session), roles: session.user.roles })) {
    return (
      <StateCard
        title="无访问权限"
        message={`当前账号 ${session.user.email || session.user.phone || session.user.id} 没有 billing admin 权限。`}
        action={
          <Button alignSelf="start" onClick={() => { window.location.href = "/billing"; }} size="sm" variant="outline">
            返回积分中心
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}

function StateCard({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <Box bg="bg.canvas" minH="100vh" py="12">
      <Stack
        bg="bg.surface"
        borderColor="border.default"
        borderRadius="xl"
        borderWidth="1px"
        gap="3"
        maxW="3xl"
        mx="auto"
        px="6"
        py="8"
      >
        <Heading fontSize="lg">{title}</Heading>
        <Text color="fg.muted" fontSize="sm">{message}</Text>
        {action}
      </Stack>
    </Box>
  );
}
