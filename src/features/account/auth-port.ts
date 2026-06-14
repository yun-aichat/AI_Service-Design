export type AuthChannel = "email" | "phone";

export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isAnonymous: boolean;
};

export type AuthSession = {
  accessToken: string;
  expiresIn: number | null;
  user: AuthUser;
};

export type OtpChallenge = {
  channel: AuthChannel;
  destination: string;
  verify(code: string): Promise<AuthSession>;
};

export interface AuthPort {
  getSession(): Promise<AuthSession | null>;
  requestOtp(input: {
    channel: AuthChannel;
    destination: string;
    createUser?: boolean;
  }): Promise<OtpChallenge>;
  signOut(): Promise<void>;
  subscribe(listener: (session: AuthSession | null) => void): () => void;
}

export class AuthPortError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "AuthPortError";
    this.code = code;
  }
}
