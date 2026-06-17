const DEFAULT_ENV_ID = "yunwuwei-d0gqca7d478fcf658";
const DEFAULT_REGION = "ap-shanghai";

export class CloudBaseAccessTokenVerifier {
  constructor({
    envId = process.env.CLOUDBASE_ENV_ID || DEFAULT_ENV_ID,
    fetchImpl = fetch,
  } = {}) {
    this.baseUrl = `https://${envId}.api.tcloudbasegateway.com/auth/v1`;
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
    const userId = profile.sub || profile.user_id;
    if (!userId) {
      throw new Error("CloudBase identity verification response did not include a user id.");
    }
    return {
      id: String(userId),
      email: profile.email || null,
      phone: profile.phone_number || null,
      displayName: profile.name || profile.username || null,
      roles: Array.isArray(profile.groups)
        ? profile.groups.map((group) => (typeof group === "string" ? group : group.id)).filter(Boolean)
        : [],
    };
  }
}

export function readBearerToken(authorization) {
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
