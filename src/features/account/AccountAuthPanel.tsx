import { Box, Button, Field, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useState, type FormEvent } from "react";
import type { AuthChannel, OtpChallenge } from "./auth-port";
import { useAuth } from "./AuthProvider";

export function AccountAuthPanel() {
  const { auth, session, loading, error: sessionError } = useAuth();
  const [channel, setChannel] = useState<AuthChannel>("email");
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitDestination = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const nextChallenge = await auth.requestOtp({ channel, destination, createUser: true });
      setChallenge(nextChallenge);
      setMessage(`验证码已发送至 ${nextChallenge.destination}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "验证码发送失败。");
    } finally {
      setPending(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await auth.signOut();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "退出登录失败。");
    } finally {
      setSigningOut(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!challenge) return;
    setPending(true);
    setError(null);
    try {
      await challenge.verify(code);
      setCode("");
      setChallenge(null);
      setMessage("登录成功。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "验证码验证失败。");
    } finally {
      setPending(false);
    }
  };

  if (loading) return <Text color="fg.muted">正在恢复登录状态...</Text>;

  if (session) {
    const identity = session.user.email || session.user.phone || session.user.id;
    return (
      <Stack gap="4">
        <Box>
          <Text color="fg.muted" fontSize="xs" fontWeight="medium">ACCOUNT</Text>
          <Heading fontSize="lg" mt="1">{session.user.displayName || identity}</Heading>
          <Text color="fg.muted" fontSize="sm" mt="1">{identity}</Text>
        </Box>
        <Button
          alignSelf="start"
          disabled={signingOut}
          onClick={signOut}
          size="sm"
          variant="outline"
        >
          {signingOut ? "退出中..." : "退出登录"}
        </Button>
        {error ? <Text color="status.errorFg" fontSize="sm">{error}</Text> : null}
      </Stack>
    );
  }

  return (
    <Stack gap="5">
      <Box>
        <Text color="fg.muted" fontSize="xs" fontWeight="medium">ACCOUNT</Text>
        <Heading fontSize="xl" mt="1">登录服务设计工具箱</Heading>
        <Text color="fg.muted" fontSize="sm" mt="2">
          使用邮箱或手机号接收一次性验证码。首次验证会自动创建账号。
        </Text>
      </Box>

      <Stack direction="row" gap="2">
        <Button
          onClick={() => {
            setChannel("email");
            setChallenge(null);
          }}
          size="sm"
          variant={channel === "email" ? "solid" : "outline"}
        >
          邮箱
        </Button>
        <Button
          onClick={() => {
            setChannel("phone");
            setChallenge(null);
          }}
          size="sm"
          variant={channel === "phone" ? "solid" : "outline"}
        >
          手机号
        </Button>
      </Stack>

      {!challenge ? (
        <Stack as="form" gap="4" onSubmit={submitDestination}>
          <Field.Root required>
            <Field.Label>{channel === "email" ? "邮箱地址" : "手机号"}</Field.Label>
            <Input
              autoComplete={channel === "email" ? "email" : "tel"}
              onChange={(event) => setDestination(event.target.value)}
              placeholder={channel === "email" ? "name@example.com" : "13800138000"}
              type={channel === "email" ? "email" : "tel"}
              value={destination}
            />
          </Field.Root>
          <Button disabled={pending} type="submit">
            {pending ? "发送中..." : "发送验证码"}
          </Button>
        </Stack>
      ) : (
        <Stack as="form" gap="4" onSubmit={submitCode}>
          <Field.Root required>
            <Field.Label>验证码</Field.Label>
            <Input
              autoComplete="one-time-code"
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              placeholder="输入收到的验证码"
              value={code}
            />
          </Field.Root>
          <Stack direction="row" gap="2">
            <Button disabled={pending} type="submit">
              {pending ? "验证中..." : "验证并登录"}
            </Button>
            <Button
              onClick={() => {
                setChallenge(null);
                setCode("");
              }}
              type="button"
              variant="outline"
            >
              返回
            </Button>
          </Stack>
        </Stack>
      )}

      {message ? <Text color="status.successFg" fontSize="sm">{message}</Text> : null}
      {error || sessionError ? (
        <Text color="status.errorFg" fontSize="sm">{error || sessionError}</Text>
      ) : null}
      <Text color="fg.muted" fontSize="xs">
        当前 CloudBase 体验版无法新增本地安全域名；真实验证码联调请使用 CloudBase 托管域名。
      </Text>
    </Stack>
  );
}
