import { ChakraProvider } from "@chakra-ui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { designSystem } from "./design-system/theme";
import { resolveEntryPage } from "./entry-routes";
import { AccountPage } from "./features/account";
import { AdminPage } from "./features/admin";
import { BillingPage } from "./features/billing";
import RoundtableLitePage from "./features/roundtable-lite/RoundtableLitePage";
import { installApiAuthFetch } from "./infrastructure/cloudbase/auth/api-auth-fetch";
import { getCloudBaseAuthPort } from "./infrastructure/cloudbase/auth/cloudbase-auth-port";
import "./styles.css";

installApiAuthFetch({
  getAccessToken: async () => {
    const session = await getCloudBaseAuthPort().getSession();
    return session?.accessToken || null;
  },
});

const entryPage = resolveEntryPage(window.location.pathname);
const RootPage =
  entryPage === "account"
    ? AccountPage
    : entryPage === "admin"
      ? AdminPage
      : entryPage === "billing"
        ? BillingPage
        : entryPage === "roundtable"
          ? RoundtableLitePage
          : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChakraProvider value={designSystem}>
      <RootPage />
    </ChakraProvider>
  </StrictMode>
);
