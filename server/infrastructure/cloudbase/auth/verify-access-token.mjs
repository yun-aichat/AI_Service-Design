const DEFAULT_ENV_ID = "yunwuwei-d0gqca7d478fcf658";
const DEFAULT_REGION = "ap-shanghai";

function normalizeRoles(groups, appMetadataRoles) {
  const roles = new Set();

  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (typeof group === "string" && group) {
        roles.add(group);
      } else if (group && typeof group === "object" && typeof group.id === "string" && group.id) {
        roles.add(group.id);
      }
    }
  }

  if (Array.isArray(appMetadataRoles)) {
    for (const role of appMetadataRoles) {
      if (typeof role === "string" && role) {
        roles.add(role);
      }
    }
  }

  return [...roles];
}

export class CloudBaseAccessTokenVerifier {
  constructor({
    envId = process.env.CLOUDBASE_ENV_ID || DEFAULT_ENV_ID,
    region = process.env.CLOUDBASE_REGION || DEFAULT_REGION,
    fetchImpl = fetch,
  } = {}) {
    this.baseUrl = `https://${envId}.${region}.tcb-api.tencentcloudapi.com/auth/v1`;
    this.fetch = fetchImpl;
  }

  async verify(accessToken) {
    if (!accessToken) return null;
    const response = await this.fetch(`${this.baseUrl}/user/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) {
      throw new Error(`CloudBase identity verification failed with status ${response.status}.`);
    }

    const profile = await response.json();
    return {
      id: String(profile.sub),
      email: profile.email || null,
      phone: profile.phone_number || null,
      displayName: profile.name || profile.username || null,
      roles: normalizeRoles(profile.groups, profile.app_metadata?.roles),
    };
  }
}

export function readBearerToken(authorization) {
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
