import { resolveCloudBaseAuthConfig } from "./config-core";
export type { CloudBaseAuthConfig } from "./config-core";

export function getCloudBaseAuthConfig() {
  return resolveCloudBaseAuthConfig({
    VITE_CLOUDBASE_ENV_ID: import.meta.env.VITE_CLOUDBASE_ENV_ID,
    VITE_CLOUDBASE_REGION: import.meta.env.VITE_CLOUDBASE_REGION,
    VITE_CLOUDBASE_PUBLISHABLE_KEY: import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY,
  });
}
