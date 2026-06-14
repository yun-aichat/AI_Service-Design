import ComponentLibraryPage from "../design-system/ComponentLibraryPage";
import type { AppRoute, ThemeMode } from "./shell-types";

type ComponentLibraryProps = {
  navigate: (route: AppRoute) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

export default function ComponentLibrary({
  navigate,
  theme,
  setTheme,
}: ComponentLibraryProps) {
  return (
    <ComponentLibraryPage
      navigate={navigate}
      setTheme={setTheme}
      theme={theme}
    />
  );
}
