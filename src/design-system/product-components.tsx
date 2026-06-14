import { Box, Flex, Grid, Heading, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { WorkbenchButton, WorkbenchTextarea } from "./controls";

export function AppShellPreview({ children }: { children: ReactNode }) {
  return (
    <Grid
      bg="bg.surface"
      borderColor="border.default"
      borderRadius="lg"
      borderWidth="1px"
      gridTemplateRows="44px minmax(240px, 1fr)"
      minW="620px"
      overflow="hidden"
    >
      {children}
    </Grid>
  );
}
export function TopBarPreview() {
  return (
    <Flex align="center" borderBottomColor="border.default" borderBottomWidth="1px" justify="space-between" px="4">
      <Flex align="baseline" gap="3">
        <Text color="fg.muted" fontSize="xs">Service Design Tools</Text>
        <Text fontSize="sm" fontWeight="medium">用户旅程图</Text>
      </Flex>
      <Flex gap="1">
        <WorkbenchButton density="compact" visual="outline">导出</WorkbenchButton>
        <WorkbenchButton density="compact" visual="outline">组件库</WorkbenchButton>
      </Flex>
    </Flex>
  );
}
export function ChatPreview() {
  return (
    <Stack bg="bg.panel" borderLeftColor="border.default" borderLeftWidth="1px" gap="3" p="4">
      <Text color="fg.muted" fontSize="xs" fontWeight="medium">AI ASSISTANT</Text>
      <Box bg="bg.surface" borderColor="border.default" borderRadius="md" borderWidth="1px" p="3">
        <Text fontSize="sm">我会先澄清目标，再提供可确认的结构化修改。</Text>
      </Box>
      <Box alignSelf="flex-end" bg="interaction.selected" borderRadius="md" maxW="85%" p="3">
        <Text fontSize="sm">把预约阶段拆成选择门店和选择时间。</Text>
      </Box>
      <WorkbenchTextarea aria-label="消息示例" placeholder="描述需要调整的内容" />
      <WorkbenchButton visual="primary">发送</WorkbenchButton>
    </Stack>
  );
}

export function ProposalPreview() {
  return (
    <Stack bg="bg.surface" borderColor="border.default" borderRadius="md" borderWidth="1px" gap="3" p="4">
      <Box>
        <Text color="fg.muted" fontSize="xs" fontWeight="medium">PROPOSAL</Text>
        <Heading fontSize="sm" mt="1">将预约阶段拆分为两个步骤</Heading>
      </Box>
      <Text color="fg.muted" fontSize="sm">新增“选择门店”和“选择时间”，保留原有单元格内容并等待用户确认。</Text>
      <Flex gap="2">
        <WorkbenchButton density="compact" visual="primary">确认更新</WorkbenchButton>
        <WorkbenchButton density="compact" visual="outline">暂不应用</WorkbenchButton>
      </Flex>
    </Stack>
  );
}

export function MatrixPreview() {
  const cells = ["维度", "发现需求", "完成预约", "用户行为", "搜索服务入口", "选择门店与时间"];
  return (
    <Grid
      borderColor="border.default"
      borderLeftWidth="1px"
      borderTopWidth="1px"
      gridTemplateColumns="140px repeat(2, minmax(150px, 1fr))"
      minW="520px"
    >
      {cells.map((cell, index) => (
        <Box
          key={cell}
          bg={index < 3 ? "bg.panel" : index === 4 ? "interaction.selected" : "bg.surface"}
          borderBottomColor="border.default"
          borderBottomWidth="1px"
          borderRightColor="border.default"
          borderRightWidth="1px"
          color={index === 0 || index === 3 ? "fg.muted" : "fg.default"}
          fontSize="sm"
          fontWeight={index < 3 ? "medium" : "normal"}
          minH={index < 3 ? "11" : "20"}
          p="3"
        >
          {cell}
        </Box>
      ))}
    </Grid>
  );
}
