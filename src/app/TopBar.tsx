import { Button, IconButton } from "@chakra-ui/react";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { AppRoute, ThemeMode } from "./shell-types";

type TopBarProps = {
  title: string;
  children?: ReactNode;
  navigate: (route: AppRoute) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

export default function TopBar({ title, children, navigate, theme, setTheme }: TopBarProps) {
  return (
    <header className="app-header">
      <div className="tool-identity">
        <span className="product-name">Service Design Tools</span>
        <strong>{title}</strong>
      </div>
      <nav className="top-actions" aria-label="页面操作">
        {children}
        <Button className="top-button" onClick={() => navigate(title === "组件库" ? "journey" : "components")}>
          {title === "组件库" ? "用户旅程图" : "组件库"}
        </Button>
        <IconButton
          className="icon-button"
          aria-label={theme === "dark" ? "切换到白天模式" : "切换到夜间模式"}
          aria-pressed={theme === "dark"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
      </nav>
    </header>
  );
}
