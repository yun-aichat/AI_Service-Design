const DEFAULT_ENV_ID = "yunwuwei-d0gqca7d478fcf658";
const DEFAULT_REGION = "ap-shanghai";

function readRoleName(value) {
  if (typeof value === "string" && value) return value;
  if (!value || typeof value !== "object") return null;
  if (typeof value.id === "string" && value.id) return value.id;
  if (typeof value.roleIdentity === "string" && value.roleIdentity) return value.roleIdentity;
  if (typeof value.RoleIdentity === "string" && value.RoleIdentity) return value.RoleIdentity;
  if (typeof value.name === "string" && value.name) return value.name;
  return null;
}

function appendRoles(target, values) {
  const singleRole = readRoleName(values);
  if (singleRole) {
    target.add(singleRole);
    return;
  }
  if (!Array.isArray(values)) return;
  for (const value of values) {
    const role = readRoleName(value);
    if (role) {
      target.add(role);
    }
  }
}

function appendInternalRoles(target, internalUserType) {
  if (internalUserType === "administrator") {
    target.add("admin");
  }
}

function normalizeRoles(groups, appMetadataRoles, directRoles, alternateRoles, internalUserType) {
  const roles = new Set();

  if (Array.isArray(groups)) {
    appendRoles(roles, groups);
  }

  appendRoles(roles, appMetadataRoles);
  appendRoles(roles, directRoles);
  appendRoles(roles, alternateRoles);
  appendInternalRoles(roles, internalUserType);

  return [...roles];
}

function optionalString(value) {
  return typeof value === "string" && value ? value : null;
}

function toVerifiedProfile(profile) {
  const userId = profile?.sub || profile?.user_id;
  if (!userId) {
    throw new Error("CloudBase identity verification response did not include a user id.");
  }
  return {
    id: String(userId),
    email: optionalString(profile.email),
    phone: optionalString(profile.phone_number),
    displayName:
      optionalString(profile.name) ||
      optionalString(profile.username) ||
      optionalString(profile.user_metadata?.nickName),
    roles: normalizeRoles(
      profile.groups,
      profile.app_metadata?.roles,
      profile.role,
      profile.roles,
      profile.internal_user_type,
    ),
  };
}

function decodeJwtPayload(token) {
  try {
    const segments = String(token || "").split(".");
    if (segments.length < 2) return null;
    const payload = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized = payload.padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "=",
    );
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export class CloudBaseAccessTokenVerifier {
  constructor({
    envId = process.env.CLOUDBASE_ENV_ID || DEFAULT_ENV_ID,
    fetchImpl = fetch,
    allowUnverifiedTokenFallback = process.env.PERSISTENCE_ALLOW_UNVERIFIED_BEARER === "1",
  } = {}) {
    this.baseUrl = `https://${envId}.api.tcloudbasegateway.com/auth/v1`;
    this.fetch = fetchImpl;
    this.allowUnverifiedTokenFallback = allowUnverifiedTokenFallback;
  }

  async verify(accessToken) {
    if (!accessToken) return null;
    const response = await this.fetch(`${this.baseUrl}/user/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 || response.status === 403) {
      return this.allowUnverifiedTokenFallback
        ? resolveUnverifiedProfile(accessToken)
        : null;
    }
    if (!response.ok) {
      throw new Error(`CloudBase identity verification failed with status ${response.status}.`);
    }

    const profile = await response.json();
    return toVerifiedProfile(profile);
  }
}

function resolveUnverifiedProfile(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload !== "object") return null;
  try {
    return toVerifiedProfile(payload);
  } catch {
    return null;
  }
}

export function readBearerToken(authorization) {
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
