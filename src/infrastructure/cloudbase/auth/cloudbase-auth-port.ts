import cloudbase from "@cloudbase/js-sdk";
import { CloudBaseAuthAdapter, type CloudBaseAuthClient } from "./auth-adapter-core";
import { getCloudBaseAuthConfig, type CloudBaseAuthConfig } from "./config";

export class CloudBaseAuthPort extends CloudBaseAuthAdapter {
  constructor(config: CloudBaseAuthConfig = getCloudBaseAuthConfig()) {
    const app = cloudbase.init({
      env: config.envId,
      region: config.region,
      accessKey: config.publishableKey,
      auth: { detectSessionInUrl: true },
    });
    super(app.auth as unknown as CloudBaseAuthClient);
  }
}

let sharedAuthPort: CloudBaseAuthPort | null = null;

export function getCloudBaseAuthPort() {
  sharedAuthPort ??= new CloudBaseAuthPort();
  return sharedAuthPort;
}
