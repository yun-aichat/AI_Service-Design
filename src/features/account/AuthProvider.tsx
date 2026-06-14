import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCloudBaseAuthPort } from "../../infrastructure/cloudbase/auth/cloudbase-auth-port";
import type { AuthPort, AuthSession } from "./auth-port";

type AuthContextValue = {
  auth: AuthPort;
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  auth = getCloudBaseAuthPort(),
}: {
  children: ReactNode;
  auth?: AuthPort;
}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = auth.subscribe((nextSession) => {
      if (active) setSession(nextSession);
    });

    auth
      .getSession()
      .then((nextSession) => {
        if (active) setSession(nextSession);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "无法恢复登录状态。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  const value = useMemo(() => ({ auth, session, loading, error }), [auth, session, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
