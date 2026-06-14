import { AuthPortError } from "../../../features/account/auth-port";

export type CloudBaseAuthConfig = {
  envId: string;
  region: string;
  publishableKey: string;
};

type CloudBaseAuthEnvironment = {
  VITE_CLOUDBASE_ENV_ID?: string;
  VITE_CLOUDBASE_REGION?: string;
  VITE_CLOUDBASE_PUBLISHABLE_KEY?: string;
};

export function resolveCloudBaseAuthConfig(
  environment: CloudBaseAuthEnvironment
): CloudBaseAuthConfig {
  const envId = environment.VITE_CLOUDBASE_ENV_ID?.trim();
  const region = environment.VITE_CLOUDBASE_REGION?.trim();
  const publishableKey = environment.VITE_CLOUDBASE_PUBLISHABLE_KEY?.trim();
  const missing = [
    !envId && "VITE_CLOUDBASE_ENV_ID",
    !region && "VITE_CLOUDBASE_REGION",
    !publishableKey && "VITE_CLOUDBASE_PUBLISHABLE_KEY",
  ].filter(Boolean);

  if (!envId || !region || !publishableKey) {
    throw new AuthPortError(
      `CloudBase 账号认证缺少配置：${missing.join("、")}。`,
      "CONFIG_MISSING"
    );
  }
  if (!publishableKey.startsWith("eyJ")) {
    throw new AuthPortError(
      "CloudBase 账号认证的 publishable key 格式无效。",
      "CONFIG_INVALID"
    );
  }

  return { envId, region, publishableKey };
}
