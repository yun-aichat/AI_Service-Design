import { ChakraProvider } from "@chakra-ui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { designSystem } from "./design-system/theme";
import { AccountPage } from "./features/account";
import { AdminPage } from "./features/admin";
import { BillingPage } from "./features/billing";
import "./styles.css";

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const RootPage =
  path === "/account"
    ? AccountPage
    : path.startsWith("/admin")
      ? AdminPage
      : path === "/billing"
        ? BillingPage
        : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChakraProvider value={designSystem}>
      <RootPage />
    </ChakraProvider>
  </StrictMode>
);
