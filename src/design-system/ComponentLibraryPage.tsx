import { Badge, Box, chakra, Flex, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { AlertTriangle, Check, Info, LogIn, Moon, Sun, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { WorkbenchButton, WorkbenchInput, WorkbenchTextarea } from "./controls";
import { AppShellPreview, ChatPreview, MatrixPreview, ProposalPreview, TopBarPreview } from "./product-components";

const semanticTokenGroups = [
  {
    title: "品牌与背景",
    tokens: [
      ["brand.primary", "品牌主色", "#fc7260 / #ff8d73"],
      ["brand.onPrimary", "主色前景", "#fffefb / #181715"],
      ["bg.canvas", "页面画布", "#fffefb / #161210"],
      ["bg.surface", "主要卡片", "94% white / #1d1815"],
      ["bg.panel", "分组与侧栏", "#f6f1ea / #201a17"],
      ["bg.secondary", "次级控件", "#f6efe7 / #3f3631"],
      ["bg.accent", "选中与轻强调", "#ffede8 / 18% coral"],
      ["bg.popover", "弹出表面", "#ffffff / #1d1815"],
      ["bg.elevated", "浮层表面", "#ffffff / #241d19"],
      ["bg.overlay", "模态遮罩", "36% ink / 62% black"],
    ],
  },
  {
    title: "文字",
    tokens: [
      ["fg.default", "主要文字", "#141110 / #f6efe7"],
      ["fg.muted", "辅助正文", "#6f6b64 / #b5aea4"],
      ["fg.subtle", "弱提示", "#8e8b82 / #8f887f"],
      ["fg.disabled", "禁用文字", "#8e8b82 / #77716a"],
      ["fg.inverse", "反色文字", "#fffefb / #141110"],
      ["fg.link", "文字链接", "#a63a2d / #ff9e88"],
      ["fg.accent", "强调面文字", "#252320 / #ffe7e0"],
    ],
  },
  {
    title: "边界与交互",
    tokens: [
      ["border.subtle", "装饰分割线", "8% ink / 7% white"],
      ["border.default", "卡片边界", "12% ink / 10% white"],
      ["border.input", "控件边界", "#9b918a / #77716a"],
      ["border.strong", "强调边界", "#6f6b64 / #b5aea4"],
      ["border.focus", "焦点边界", "#a63a2d / #ff9e88"],
      ["border.error", "错误边界", "#b42318 / #ff9b92"],
      ["interaction.selected", "普通选中背景", "#ffede8 / 18% coral"],
      ["interaction.focusRing", "键盘焦点环", "#a63a2d / #ff9e88"],
    ],
  },
  {
    title: "状态",
    tokens: [
      ["status.info", "信息实色", "#6193fd / #6b82ff"],
      ["status.infoSurface", "信息背景", "#edf3ff / 14% blue"],
      ["status.infoBorder", "信息边界", "#3569d4 / #91a3ff"],
      ["status.infoFg", "信息文字", "#244b9b / #b3c0ff"],
      ["status.success", "成功实色", "#27c93f / #27cf8d"],
      ["status.successSurface", "成功背景", "#ebfbed / 13% green"],
      ["status.successBorder", "成功边界", "#168a2b / #62dfa9"],
      ["status.successFg", "成功文字", "#116b22 / #8be8bf"],
      ["status.warning", "警告实色", "#ffbd2e / #ffd15d"],
      ["status.warningSurface", "警告背景", "#fff8df / 13% yellow"],
      ["status.warningBorder", "警告边界", "#b77900 / #ffd978"],
      ["status.warningFg", "警告文字", "#704800 / #ffe19a"],
      ["status.error", "错误实色", "#ff5f56 / #ff796f"],
      ["status.errorSurface", "错误背景", "#fff0ee / 14% red"],
      ["status.errorBorder", "错误边界", "#d92d20 / #ff9b92"],
      ["status.errorFg", "错误文字", "#8f1d15 / #ffb4ad"],
      ["status.onSolid", "状态实色前景", "#ffffff"],
    ],
  },
];

const statusTokens = [
  ["status.info", "信息", "用于解释与进度说明"],
  ["status.success", "成功", "用于完成与发布状态"],
  ["status.warning", "警告", "用于待确认与风险提醒"],
  ["status.error", "错误", "用于失败与危险操作"],
];

function Section({ title, eyebrow, description, children }: {
  title: string;
  eyebrow: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="5" py={{ base: "8", md: "10" }}>
      <Box maxW="720px">
        <Text color="fg.link" fontSize="xs" fontWeight="semibold" letterSpacing="0.14em">{eyebrow}</Text>
        <Heading fontSize={{ base: "xl", md: "2xl" }} fontWeight="semibold" mt="1">{title}</Heading>
        {description ? <Text color="fg.muted" fontSize="sm" mt="2">{description}</Text> : null}
      </Box>
      {children}
    </Stack>
  );
}

function Demo({ title, description, children, interactive = false }: {
  title: string;
  description: string;
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <Grid
      bg="bg.surface"
      borderColor="border.default"
      borderRadius="lg"
      borderWidth="1px"
      boxShadow="sm"
      gap="5"
      gridTemplateColumns={{ base: "1fr", lg: "220px minmax(0, 1fr)" }}
      p={{ base: "4", md: "5" }}
      transition="border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease"
      _hover={interactive ? {
        borderColor: "color-mix(in srgb, var(--chakra-colors-brand-primary) 30%, var(--chakra-colors-border-default))",
        boxShadow: "interactive",
        transform: "translateY(-1px)",
      } : undefined}
    >
      <Box>
        <Heading fontSize="sm" fontWeight="semibold">{title}</Heading>
        <Text color="fg.muted" fontSize="sm" mt="2">{description}</Text>
      </Box>
      <Box minW="0" overflowX="auto">{children}</Box>
    </Grid>
  );
}

function StatusAlert({ token, title, children }: { token: string; title: string; children: ReactNode }) {
  const statusName = token.replace("status.", "");
  const surfaceToken = `status.${statusName}Surface`;
  const foregroundToken = `status.${statusName}Fg`;
  const Icon = token === "status.success"
    ? Check
    : token === "status.error"
      ? X
      : token === "status.warning"
        ? AlertTriangle
        : Info;
  return (
    <Flex
      align="flex-start"
      bg={surfaceToken}
      borderColor={token}
      borderRadius="md"
      borderWidth="1px"
      gap="3"
      p="4"
    >
      <Flex align="center" bg={token} borderRadius="full" color="status.onSolid" flex="0 0 auto" h="7" justify="center" w="7">
        <Icon size={16} strokeWidth={2} />
      </Flex>
      <Box>
        <Text color={foregroundToken} fontSize="sm" fontWeight="semibold">{title}</Text>
        <Text color="fg.muted" fontSize="sm" mt="1">{children}</Text>
      </Box>
    </Flex>
  );
}

function InteractiveFormDemo() {
  const [name, setName] = useState("");
  const [revision, setRevision] = useState("需要修正的内容");
  const [notes, setNotes] = useState("支持多行内容和键盘焦点。");
  const [saveRevision, setSaveRevision] = useState(true);
  const [notifyTeam, setNotifyTeam] = useState(false);

  const checkbox = (checked: boolean, label: string, onClick: () => void) => (
    <chakra.button
      alignItems="center"
      display="flex"
      gap="2"
      onClick={onClick}
      role="checkbox"
      aria-checked={checked}
      textAlign="left"
      type="button"
      borderRadius="xs"
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "brand.primary",
        outlineOffset: "2px",
      }}
    >
      <Flex
        align="center"
        bg={checked ? "brand.primary" : "bg.surface"}
        borderColor={checked
          ? "color-mix(in srgb, var(--chakra-colors-brand-primary) 72%, var(--chakra-colors-fg-default))"
          : "border.default"}
        borderRadius="xs"
        borderWidth="1px"
        color="brand.onPrimary"
        h="5"
        justify="center"
        transition="background 180ms ease, border-color 180ms ease"
        w="5"
      >
        {checked ? <Check size={14} strokeWidth={2} /> : null}
      </Flex>
      <Text color={checked ? "fg.default" : "fg.muted"} fontSize="sm">{label}</Text>
    </chakra.button>
  );

  return (
    <Grid gap="3" gridTemplateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }}>
      <WorkbenchInput
        aria-label="项目名称"
        onChange={(event) => setName(event.target.value)}
        placeholder="输入项目名称"
        value={name}
      />
      <WorkbenchInput
        aria-invalid={revision.length < 4}
        aria-label="修订内容"
        onChange={(event) => setRevision(event.target.value)}
        value={revision}
      />
      <WorkbenchTextarea
        aria-label="项目说明"
        onChange={(event) => setNotes(event.target.value)}
        value={notes}
      />
      <Stack gap="3" justify="center">
        {checkbox(saveRevision, "保存后同步生成修订记录", () => setSaveRevision((value) => !value))}
        {checkbox(notifyTeam, "完成后通知项目成员", () => setNotifyTeam((value) => !value))}
      </Stack>
    </Grid>
  );
}

function LoginDemo() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <Stack
      as="form"
      bg="bg.surface"
      borderColor="border.default"
      borderRadius="lg"
      borderWidth="1px"
      gap="4"
      maxW="420px"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
      p="5"
    >
      <Flex align="center" gap="3">
        <Flex align="center" bg="bg.accent" borderRadius="md" color="brand.primary" h="10" justify="center" w="10">
          <LogIn size={18} />
        </Flex>
        <Box>
          <Heading fontSize="section" fontWeight="medium">登录服务设计工具箱</Heading>
          <Text color="fg.muted" fontSize="caption" mt="1">使用邮箱和密码继续。</Text>
        </Box>
      </Flex>
      <Stack gap="2">
        <chakra.label fontSize="caption" htmlFor="component-login-email">邮箱</chakra.label>
        <WorkbenchInput
          autoComplete="email"
          id="component-login-email"
          onChange={(event) => {
            setEmail(event.target.value);
            setSubmitted(false);
          }}
          placeholder="name@example.com"
          required
          type="email"
          value={email}
        />
      </Stack>
      <Stack gap="2">
        <chakra.label fontSize="caption" htmlFor="component-login-password">密码</chakra.label>
        <WorkbenchInput
          autoComplete="current-password"
          id="component-login-password"
          minLength={6}
          onChange={(event) => {
            setPassword(event.target.value);
            setSubmitted(false);
          }}
          placeholder="至少 6 位字符"
          required
          type="password"
          value={password}
        />
      </Stack>
      {submitted ? (
        <Text color="status.successFg" fontSize="caption">
          表单校验通过。示例不会发送真实登录请求。
        </Text>
      ) : null}
      <WorkbenchButton type="submit" visual="primary">登录</WorkbenchButton>
      <WorkbenchButton type="button" visual="outline">使用验证码登录</WorkbenchButton>
    </Stack>
  );
}

function ConfirmationDialogDemo() {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <>
      <Stack align="flex-start" gap="3">
        <WorkbenchButton
          onClick={() => {
            setConfirmed(false);
            setOpen(true);
          }}
          visual="danger"
        >
          <Trash2 size={16} />
          删除项目
        </WorkbenchButton>
        <Text color={confirmed ? "status.successFg" : "fg.muted"} fontSize="caption">
          {confirmed ? "已确认删除。示例未执行真实数据操作。" : "点击查看危险操作的二次确认流程。"}
        </Text>
      </Stack>

      {open ? (
        <Flex
          align="center"
          bg="bg.overlay"
          inset="0"
          justify="center"
          p="4"
          position="fixed"
          zIndex="modal"
        >
          <Stack
            aria-describedby="confirm-dialog-description"
            aria-labelledby="confirm-dialog-title"
            aria-modal="true"
            bg="bg.elevated"
            borderColor="border.default"
            borderRadius="xl"
            borderWidth="1px"
            boxShadow="lg"
            gap="5"
            maxW="420px"
            p={{ base: "5", md: "6" }}
            role="alertdialog"
            w="100%"
          >
            <Box>
              <Heading fontSize="title" fontWeight="medium" id="confirm-dialog-title">确认删除这个项目？</Heading>
              <Text color="fg.muted" fontSize="body" id="confirm-dialog-description" mt="2">
                删除后将无法恢复项目内容、修订记录和相关附件。
              </Text>
            </Box>
            <Flex gap="3" justify="flex-end">
              <WorkbenchButton autoFocus onClick={() => setOpen(false)} visual="secondary">取消</WorkbenchButton>
              <WorkbenchButton
                onClick={() => {
                  setOpen(false);
                  setConfirmed(true);
                }}
                visual="danger"
              >
                确认删除
              </WorkbenchButton>
            </Flex>
          </Stack>
        </Flex>
      ) : null}
    </>
  );
}

function FilterChip({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <chakra.button
      bg={active ? "bg.accent" : "bg.surface"}
      borderColor={active ? "brand.primary" : "border.default"}
      borderRadius="md"
      borderWidth="1px"
      color={active ? "brand.primary" : "fg.muted"}
      fontSize="sm"
      fontWeight="medium"
      px="3"
      py="2"
      transition="background 180ms ease, border-color 180ms ease, color 180ms ease"
      type="button"
      _focusVisible={{
        borderColor: "brand.primary",
        boxShadow: "0 0 0 3px color-mix(in srgb, var(--chakra-colors-brand-primary) 18%, transparent)",
        outline: "none",
      }}
    >
      {children}
    </chakra.button>
  );
}

type ThemeMode = "light" | "dark";

type ComponentLibraryPageProps = {
  navigate?: (route: "journey" | "components") => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

export default function ComponentLibraryPage({ navigate, theme, setTheme }: ComponentLibraryPageProps) {
  useEffect(() => {
    document.body.classList.add("library-body");
    return () => document.body.classList.remove("library-body");
  }, []);

  return (
    <Box
      bg="bg.canvas"
      minH="100vh"
      position="relative"
      _before={{
        bg: "radial-gradient(circle at 12% 4%, color-mix(in srgb, var(--chakra-colors-brand-primary) 12%, transparent), transparent 28%), radial-gradient(circle at 88% 16%, color-mix(in srgb, var(--chakra-colors-status-warning) 9%, transparent), transparent 25%)",
        content: "\"\"",
        inset: "0",
        pointerEvents: "none",
        position: "absolute",
        _dark: {
          bg: "none",
        },
      }}
    >
      <Flex
        align="center"
        backdropFilter="blur(16px)"
        bg={{ base: "color-mix(in srgb, var(--chakra-colors-bg-canvas) 88%, transparent)", _dark: "bg.canvas" }}
        borderBottomColor="border.default"
        borderBottomWidth="1px"
        justify="space-between"
        minH="14"
        position="sticky"
        px={{ base: "4", md: "6" }}
        top="0"
        zIndex="sticky"
      >
        <HStack gap="3">
          <Text color="fg.muted" fontSize="xs">Service Design Tools</Text>
          <Text fontSize="sm" fontWeight="semibold">组件规范</Text>
        </HStack>
        <HStack>
          <WorkbenchButton density="compact" onClick={() => navigate?.("journey")} visual="outline">
            返回工具
          </WorkbenchButton>
          <WorkbenchButton
            aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            density="compact"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            visual="secondary"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {theme === "dark" ? "浅色" : "深色"}
          </WorkbenchButton>
        </HStack>
      </Flex>

      <Stack gap="0" mx="auto" px={{ base: "4", md: "6" }} position="relative" width="min(1180px, 100%)">
        <Grid
          alignItems="end"
          bg="bg.surface"
          borderColor="border.default"
          borderRadius="xl"
          borderWidth="1px"
          boxShadow="lg"
          gap="8"
          gridTemplateColumns={{ base: "1fr", lg: "minmax(0, 1.25fr) minmax(300px, 0.75fr)" }}
          mt={{ base: "6", md: "10" }}
          overflow="hidden"
          p={{ base: "6", md: "8" }}
        >
          <Stack gap="5" maxW="720px">
            <Badge alignSelf="flex-start" bg="bg.accent" borderColor="border.default" borderRadius="sm" borderWidth="1px" color="fg.accent" px="2.5" py="1">
              COSS LANGUAGE · CHAKRA FOUNDATION
            </Badge>
            <Box>
              <Heading fontSize={{ base: "3xl", md: "5xl" }} fontWeight="semibold" letterSpacing="-0.025em" lineHeight="1.08">
                暖、清晰、克制。
                <br />
                先看真实组件，再决定页面怎么长。
              </Heading>
              <Text color="fg.muted" fontSize={{ base: "sm", md: "md" }} lineHeight="1.8" mt="4">
                本页把 coss 的语义色、圆角、边界和交互节奏映射到 Chakra UI。业务组件继续使用项目 Recipe，不复制另一套组件库实现。
              </Text>
            </Box>
            <HStack flexWrap="wrap" gap="2">
              {["语义 Token 驱动", "浅色与深色一致", "180ms 轻交互"].map((item) => (
                <Badge key={item} bg="bg.secondary" borderColor="border.default" borderRadius="sm" borderWidth="1px" color="fg.muted" px="3" py="2">
                  {item}
                </Badge>
              ))}
            </HStack>
          </Stack>
          <Stack bg="bg.canvas" borderColor="border.default" borderRadius="lg" borderWidth="1px" gap="4" p="5">
            <Text fontSize="sm" fontWeight="semibold">主题预览</Text>
            <Grid gap="3" gridTemplateColumns="repeat(2, 1fr)">
              <Stack bg="bg.surface" borderColor="border.default" borderRadius="md" borderWidth="1px" gap="1" p="4">
                <Text color="fg.muted" fontSize="xs" fontWeight="semibold">PRIMARY</Text>
                <Text fontSize="2xl" fontWeight="semibold">{theme === "dark" ? "#ff8d73" : "#fc7260"}</Text>
                <Text color="fg.muted" fontSize="xs">主按钮、焦点、关键反馈</Text>
              </Stack>
              <Stack bg="bg.accent" borderColor="border.default" borderRadius="md" borderWidth="1px" gap="1" p="4">
                <Text color="fg.accent" fontSize="xs" fontWeight="semibold">ACCENT</Text>
                <Text color="fg.accent" fontSize="sm">轻强调承接选中和说明，不与主要操作争抢视觉中心。</Text>
              </Stack>
            </Grid>
          </Stack>
        </Grid>

        <Section
          eyebrow="SEMANTIC TOKENS"
          title="先定义角色，再使用颜色"
          description="固定色值只存在于主题配置；页面和组件只引用语义 Token。浅色与深色模式共享相同角色。"
        >
          <Stack gap="7">
            {semanticTokenGroups.map((group) => (
              <Stack gap="3" key={group.title}>
                <Text color="fg.muted" fontSize="sm" fontWeight="medium">{group.title}</Text>
                <Grid gap="3" gridTemplateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}>
                  {group.tokens.map(([token, use, value]) => (
                    <Stack bg="bg.surface" borderColor="border.default" borderRadius="lg" borderWidth="1px" gap="2" key={token} p="4">
                      <Box bg={token} borderColor="border.default" borderRadius="md" borderWidth="1px" h="14" />
                      <Text fontFamily="mono" fontSize="xs">{token}</Text>
                      <Text color="fg.muted" fontSize="xs">{use}</Text>
                      <Text color="fg.muted" fontFamily="mono" fontSize="2xs">{value}</Text>
                    </Stack>
                  ))}
                </Grid>
              </Stack>
            ))}
          </Stack>
        </Section>

        <Section
          eyebrow="FOUNDATION"
          title="圆角、间距和交互节奏"
          description="圆角只使用 6 / 8 / 10 / 12 / 14px；间距沿用 Chakra 的 4px 刻度；可点击的小卡片使用轻微抬升，大页面容器保持静止。"
        >
          <Grid gap="4" gridTemplateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }}>
            <Demo interactive title="Radius scale" description="从紧凑标签到大容器，层级逐步增加，不使用夸张胶囊。">
              <Flex align="end" gap="3" wrap="wrap">
                {[["xs", "6"], ["sm", "8"], ["md", "10"], ["lg", "12"], ["xl", "14"]].map(([token, value]) => (
                  <Flex align="center" bg="bg.accent" borderColor="brand.primary" borderRadius={token} borderWidth="1px" h="16" justify="center" key={token} w="16">
                    <Text fontSize="xs">{value}px</Text>
                  </Flex>
                ))}
              </Flex>
            </Demo>
            <Demo title="Spacing scale" description="采用 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48px 的标准节奏。">
              <Stack gap="2">
                {[4, 8, 12, 16, 20, 24, 32].map((value) => (
                  <Flex align="center" gap="3" key={value}>
                    <Box bg="brand.primary" borderRadius="xs" h="2" opacity="0.8" w={`${value * 3}px`} />
                    <Text color="fg.muted" fontSize="xs">{value}px</Text>
                  </Flex>
                ))}
              </Stack>
            </Demo>
          </Grid>
        </Section>

        <Section
          eyebrow="RECIPES"
          title="基础交互组件"
          description="默认控件保留可见边界；hover 只移动 1px；focus-visible 使用品牌色外环；disabled 不产生位移或阴影。"
        >
          <Stack gap="4">
            <Demo title="Button" description="一组操作只保留一个 primary。outline 用于低优先级操作，danger 只用于明确风险。">
              <Flex align="center" gap="3" wrap="wrap">
                <WorkbenchButton visual="primary">主要操作</WorkbenchButton>
                <WorkbenchButton visual="secondary">次要操作</WorkbenchButton>
                <WorkbenchButton visual="outline">描边操作</WorkbenchButton>
                <WorkbenchButton visual="danger">危险操作</WorkbenchButton>
                <WorkbenchButton disabled visual="primary">禁用</WorkbenchButton>
              </Flex>
            </Demo>
            <Demo title="Badge / Filter chip" description="标签使用小圆角；筛选激活态采用浅主色背景、品牌文字和清晰边框。">
              <Flex align="center" gap="2" wrap="wrap">
                <Badge bg="bg.secondary" borderRadius="sm" color="fg.default" px="2.5" py="1">草稿</Badge>
                <Badge bg="bg.accent" borderColor="brand.primary" borderRadius="sm" borderWidth="1px" color="brand.primary" px="2.5" py="1">AI 提案</Badge>
                <Badge bg="color-mix(in srgb, var(--chakra-colors-status-success) 12%, var(--chakra-colors-bg-surface))" borderRadius="sm" color="status.success" px="2.5" py="1">已保存</Badge>
                <FilterChip active>全部</FilterChip>
                <FilterChip>最近编辑</FilterChip>
                <FilterChip>我创建的</FilterChip>
              </Flex>
            </Demo>
            <Demo title="Input / Textarea / Checkbox" description="输入控件共享边界、焦点、禁用和错误状态；复选框在选中前后都保留边界。">
              <InteractiveFormDemo />
            </Demo>
          </Stack>
        </Section>

        <Section eyebrow="FEEDBACK" title="状态反馈" description="状态色只承担语义，不承担品牌识别。图标使用实色圆形承载，正文容器保持轻量。">
          <Grid gap="3" gridTemplateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }}>
            {statusTokens.map(([token, title, description]) => (
              <StatusAlert key={token} title={title} token={token}>{description}</StatusAlert>
            ))}
          </Grid>
        </Section>

        <Section eyebrow="COMMON PATTERNS" title="常用业务组件" description="使用真实输入和弹窗流程验证认证、危险操作、键盘焦点与浮层层级。">
          <Grid alignItems="start" gap="4" gridTemplateColumns={{ base: "1fr", lg: "repeat(2, 1fr)" }}>
            <Demo title="Login" description="邮箱密码登录示例，包含必填校验、密码输入和备用验证码入口。">
              <LoginDemo />
            </Demo>
            <Demo title="Confirmation dialog" description="危险操作必须二次确认；弹窗使用模态遮罩、明确后果和取消优先的操作顺序。">
              <ConfirmationDialogDemo />
            </Demo>
          </Grid>
        </Section>

        <Section eyebrow="REAL CONTENT" title="用真实场景验证组件组合" description="示例内容覆盖项目、活动、额度和上传状态，避免只用无语义占位符判断视觉。">
          <Grid gap="4" gridTemplateColumns={{ base: "1fr", lg: "repeat(3, 1fr)" }}>
            <Stack bg="bg.surface" borderColor="border.default" borderRadius="lg" borderWidth="1px" gap="4" p="5">
              <Flex justify="space-between">
                <Box>
                  <Text fontSize="sm" fontWeight="semibold">最近活动</Text>
                  <Text color="fg.muted" fontSize="xs" mt="1">今天更新的服务设计内容</Text>
                </Box>
                <Badge bg="bg.accent" borderRadius="sm" color="fg.accent">3 条</Badge>
              </Flex>
              {["用户旅程图已保存", "AI 提案等待确认", "研究素材已上传"].map((item, index) => (
                <Flex borderTopColor="border.default" borderTopWidth={index ? "1px" : "0"} gap="3" key={item} pt={index ? "3" : "0"}>
                  <Box bg={index === 1 ? "status.warning" : "status.success"} borderRadius="full" h="2" mt="2" w="2" />
                  <Box>
                    <Text fontSize="sm">{item}</Text>
                    <Text color="fg.muted" fontSize="xs">{index === 0 ? "2 分钟前" : index === 1 ? "18 分钟前" : "1 小时前"}</Text>
                  </Box>
                </Flex>
              ))}
            </Stack>
            <Stack bg="bg.surface" borderColor="border.default" borderRadius="lg" borderWidth="1px" gap="4" p="5">
              <Box>
                <Text fontSize="sm" fontWeight="semibold">本月工具额度</Text>
                <Text color="fg.muted" fontSize="xs" mt="1">团队基础包 · 6 月</Text>
              </Box>
              <Text fontSize="3xl" fontWeight="semibold">72 <Text as="span" color="fg.muted" fontSize="sm" fontWeight="normal">/ 100 次</Text></Text>
              <Box bg="bg.secondary" borderRadius="full" h="2" overflow="hidden">
                <Box bg="brand.primary" borderRadius="full" h="full" w="72%" />
              </Box>
              <WorkbenchButton visual="outline">查看用量明细</WorkbenchButton>
            </Stack>
            <Stack align="center" bg="bg.surface" borderColor="border.input" borderRadius="lg" borderStyle="dashed" borderWidth="1px" gap="3" justify="center" minH="220px" p="6" textAlign="center">
              <Flex align="center" bg="bg.accent" borderRadius="md" color="fg.link" h="10" justify="center" w="10"><Upload size={18} /></Flex>
              <Box>
                <Text fontSize="sm" fontWeight="semibold">添加研究素材</Text>
                <Text color="fg.muted" fontSize="xs" mt="1">支持 PNG、JPG 或 PDF，单文件不超过 10MB</Text>
              </Box>
              <WorkbenchButton density="compact" visual="secondary">选择文件</WorkbenchButton>
            </Stack>
          </Grid>
        </Section>

        <Section eyebrow="PRODUCT COMPONENTS" title="工作台专用组件" description="产品组件只处理展示和交互契约，Journey Map 领域规则仍留在工具模块。">
          <Stack gap="4">
            <Demo title="AppShell / TopBar / Chat" description="壳层负责导航、布局和滚动边界；对话区保留澄清、提案、确认语义。">
              <AppShellPreview>
                <TopBarPreview />
                <Grid gridTemplateColumns="minmax(0, 1fr) 260px">
                  <Box p="4"><MatrixPreview /></Box>
                  <ChatPreview />
                </Grid>
              </AppShellPreview>
            </Demo>
            <Demo title="Proposal" description="AI 修改以结构化提案呈现，用户确认前不得写入左侧内容。">
              <ProposalPreview />
            </Demo>
          </Stack>
        </Section>

        <Section eyebrow="ACCEPTANCE" title="进入业务页面前的检查">
          <Grid gap="3" gridTemplateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} pb="10">
            {[
              "浅色与深色主题中文字、边界和选中状态清晰",
              "所有交互组件具有可见的 focus-visible 状态",
              "hover、active、disabled、selected、error 状态按需覆盖",
              "基础组件沿用 Chakra，不复制 coss 的组件实现",
              "大页面卡片保持静止，只有可点击小卡片允许轻抬升",
              "新增组件先在 /components 验收，再进入业务页面",
            ].map((item) => (
              <Flex bg="bg.surface" borderColor="border.default" borderRadius="md" borderWidth="1px" gap="3" key={item} p="4">
                <Flex align="center" bg="brand.primary" borderRadius="full" color="brand.onPrimary" flex="0 0 auto" h="5" justify="center" mt="0.5" w="5"><Check size={12} /></Flex>
                <Text fontSize="sm">{item}</Text>
              </Flex>
            ))}
          </Grid>
        </Section>
      </Stack>
    </Box>
  );
}
