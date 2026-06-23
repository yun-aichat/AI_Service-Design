export function getBillingRedirectPath({
  authLoading,
  hasSession,
}: {
  authLoading: boolean;
  hasSession: boolean;
}) {
  if (authLoading || hasSession) return null;
  return "/account";
}
