import { Box, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { getCloudBaseAuthPort } from "../../infrastructure/cloudbase/auth/cloudbase-auth-port";
import { AccountAuthPanel } from "./AccountAuthPanel";
import { AuthProvider } from "./AuthProvider";

export default function AccountPage() {
  let auth;
  try {
    auth = getCloudBaseAuthPort();
  } catch (reason) {
    const message =
      reason instanceof Error ? reason.message : "CloudBase 账号认证配置无效。";
    return (
      <Box bg="bg.canvas" minH="100vh" py={{ base: "8", md: "16" }}>
        <Container maxW="lg">
          <Stack
            bg="bg.surface"
            borderColor="status.errorBorder"
            borderRadius="xl"
            borderWidth="1px"
            gap="3"
            p={{ base: "5", md: "8" }}
          >
            <Heading fontSize="lg">账号认证不可用</Heading>
            <Text color="status.errorFg" fontSize="sm">{message}</Text>
          </Stack>
        </Container>
      </Box>
    );
  }

  return (
    <AuthProvider auth={auth}>
      <Box bg="bg.canvas" minH="100vh" py={{ base: "8", md: "16" }}>
        <Container maxW="lg">
          <Box
            bg="bg.surface"
            borderColor="border.default"
            borderRadius="xl"
            borderWidth="1px"
            boxShadow="sm"
            p={{ base: "5", md: "8" }}
          >
            <AccountAuthPanel />
          </Box>
        </Container>
      </Box>
    </AuthProvider>
  );
}
