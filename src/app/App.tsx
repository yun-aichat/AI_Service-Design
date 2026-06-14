import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import ComponentLibrary from "./ComponentLibrary";
import type { AppRoute, PlatformShellProps, ThemeMode } from "./shell-types";

type PlatformAppProps = {
  renderJourney: (props: PlatformShellProps) => ReactNode;
};

function getRouteFromPath(pathname: string): AppRoute {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return normalizedPath === "/components" ? "components" : "journey";
}

function getInitialTheme(): ThemeMode {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function PlatformApp({ renderJourney }: PlatformAppProps) {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromPath(window.location.pathname));
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const onPopState = () => setRoute(getRouteFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("library-body", route === "components");
    return () => document.body.classList.remove("library-body");
  }, [route]);

  const navigate = (nextRoute: AppRoute) => {
    setRoute(nextRoute);
    window.history.pushState(null, "", nextRoute === "components" ? "/components" : "/");
  };

  return route === "components" ? (
    <ComponentLibrary navigate={navigate} theme={theme} setTheme={setTheme} />
  ) : (
    <>{renderJourney({ navigate, theme, setTheme })}</>
  );
}
