import {
  AuthPortError,
  type AuthChannel,
  type AuthPort,
  type AuthSession,
  type AuthUser,
  type OtpChallenge,
} from "../../../features/account/auth-port";

type CloudBaseUser = {
  id?: unknown;
  sub?: unknown;
  email?: unknown;
  phone?: unknown;
  phone_number?: unknown;
  is_anonymous?: unknown;
  user_metadata?: {
    nickName?: unknown;
    name?: unknown;
    username?: unknown;
    avatarUrl?: unknown;
    picture?: unknown;
  };
};

type CloudBaseSession = {
  access_token?: unknown;
  expires_in?: unknown;
  user?: unknown;
};

type CloudBaseResult<T> = Promise<{ data: T; error?: unknown }>;

export type CloudBaseAuthClient = {
  getSession(): CloudBaseResult<{ session?: unknown }>;
  signInWithOtp(input: Record<string, unknown>): CloudBaseResult<{
    verifyOtp?: (input: Record<string, unknown>) => CloudBaseResult<{ session?: unknown }>;
  }>;
  signOut(): Promise<unknown>;
  onAuthStateChange(
    listener: (event: unknown, session: unknown) => void
  ): { data: { subscription: { unsubscribe(): void } } };
};

export function normalizeDestination(channel: AuthChannel, destination: string) {
  const value = destination.trim();
  if (!value) {
    throw new AuthPortError(
      channel === "email" ? "请输入邮箱地址。" : "请输入手机号。",
      "INPUT_REQUIRED"
    );
  }
  if (channel === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new AuthPortError("邮箱地址格式不正确。", "INPUT_INVALID");
    }
    return value.toLowerCase();
  }

  const compact = value.replace(/[\s-]/g, "");
  if (/^1[3-9]\d{9}$/.test(compact)) return `+86${compact}`;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  throw new AuthPortError(
    "请输入中国大陆手机号或带国家区号的手机号。",
    "INPUT_INVALID"
  );
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function toAuthUser(input: unknown): AuthUser {
  const user = (input && typeof input === "object" ? input : {}) as CloudBaseUser;
  const metadata = user.user_metadata || {};
  return {
    id: String(user.id || user.sub || ""),
    email: optionalString(user.email),
    phone: optionalString(user.phone) || optionalString(user.phone_number),
    displayName:
      optionalString(metadata.nickName) ||
      optionalString(metadata.name) ||
      optionalString(metadata.username),
    avatarUrl: optionalString(metadata.avatarUrl) || optionalString(metadata.picture),
    isAnonymous: Boolean(user.is_anonymous),
  };
}

export function toAuthSession(input?: unknown): AuthSession | null {
  if (!input || typeof input !== "object") return null;
  const session = input as CloudBaseSession;
  if (typeof session.access_token !== "string" || !session.access_token || !session.user) {
    return null;
  }
  const user = toAuthUser(session.user);
  if (!user.id) return null;
  return {
    accessToken: session.access_token,
    expiresIn: typeof session.expires_in === "number" ? session.expires_in : null,
    user,
  };
}

function toError(error: unknown, fallback: string) {
  if (error instanceof AuthPortError) return error;
  if (!error || typeof error !== "object") return new AuthPortError(fallback);
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    helpMessage?: unknown;
    name?: unknown;
  };
  const networkFailure =
    candidate.name === "TypeError" ||
    (typeof candidate.message === "string" &&
      /network|fetch|timeout|offline|连接|网络/i.test(candidate.message));
  const message =
    (typeof candidate.helpMessage === "string" && candidate.helpMessage) ||
    (typeof candidate.message === "string" && candidate.message) ||
    fallback;
  const code =
    typeof candidate.code === "string"
      ? candidate.code
      : networkFailure
        ? "NETWORK_ERROR"
        : null;
  return new AuthPortError(message, code);
}

async function withAuthError<T>(operation: () => Promise<T>, fallback: string) {
  try {
    return await operation();
  } catch (error) {
    throw toError(error, fallback);
  }
}

export class CloudBaseAuthAdapter implements AuthPort {
  constructor(private readonly auth: CloudBaseAuthClient) {}

  async getSession() {
    return withAuthError(async () => {
      const { data, error } = await this.auth.getSession();
      if (error) throw error;
      return toAuthSession(data.session);
    }, "无法恢复登录状态。");
  }

  async requestOtp(input: {
    channel: AuthChannel;
    destination: string;
    createUser?: boolean;
  }): Promise<OtpChallenge> {
    const destination = normalizeDestination(input.channel, input.destination);
    return withAuthError(async () => {
      const params =
        input.channel === "email"
          ? { email: destination, options: { shouldCreateUser: input.createUser ?? true } }
          : { phone: destination, options: { shouldCreateUser: input.createUser ?? true } };
      const { data, error } = await this.auth.signInWithOtp(params);
      if (error) throw error;
      if (!data.verifyOtp) {
        throw new AuthPortError(
          "验证码已发送，但服务未返回验证流程。",
          "VERIFY_FLOW_MISSING"
        );
      }

      return {
        channel: input.channel,
        destination,
        verify: async (code: string) => {
          const token = code.trim();
          if (!token) throw new AuthPortError("请输入验证码。", "INPUT_REQUIRED");
          return withAuthError(async () => {
            const result = await data.verifyOtp?.({
              token,
              ...(input.channel === "email"
                ? { email: destination }
                : { phone: destination }),
            });
            if (!result) {
              throw new AuthPortError("验证码验证流程不可用。", "VERIFY_FLOW_MISSING");
            }
            if (result.error) throw result.error;
            const session = toAuthSession(result.data.session);
            if (!session) {
              throw new AuthPortError(
                "验证成功，但未建立用户会话。",
                "SESSION_MISSING"
              );
            }
            return session;
          }, "验证码验证失败。");
        },
      };
    }, "验证码发送失败。");
  }

  async signOut() {
    await withAuthError(async () => {
      await this.auth.signOut();
    }, "退出登录失败。");
  }

  subscribe(listener: (session: AuthSession | null) => void) {
    const {
      data: { subscription },
    } = this.auth.onAuthStateChange((_event, session) => {
      listener(toAuthSession(session));
    });
    return () => subscription.unsubscribe();
  }
}
