export type ThemeMode = "light" | "dark";

export type AppRoute = "journey" | "components";

export type PlatformShellProps = {
  navigate: (route: AppRoute) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};
