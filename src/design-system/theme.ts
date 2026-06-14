import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { workbenchButtonRecipe, workbenchFieldRecipe } from "./recipes";

export const designSystemConfig = defineConfig({
  cssVarsRoot: ":where(:root, :host)",
  theme: {
    tokens: {
      colors: {
        brand: {
          coral: { value: "#fc7260" },
          coralDark: { value: "#ff8d73" },
          yellow: { value: "#ffbd2e" },
        },
      },
      fonts: {
        body: { value: "-apple-system, 'MiSans VF', 'MiSans', 'PingFang SC', 'Microsoft YaHei', sans-serif" },
        heading: { value: "-apple-system, 'MiSans VF', 'MiSans', 'PingFang SC', 'Microsoft YaHei', sans-serif" },
      },
      fontSizes: {
        micro: { value: "0.75rem" },
        caption: { value: "0.8125rem" },
        body: { value: "0.875rem" },
        section: { value: "1rem" },
        title: { value: "1.125rem" },
        display: { value: "1.75rem" },
      },
      fontWeights: {
        regular: { value: "400" },
        medium: { value: "450" },
        semibold: { value: "550" },
      },
      lineHeights: {
        tight: { value: "1.2" },
        title: { value: "1.35" },
        body: { value: "1.55" },
        relaxed: { value: "1.7" },
      },
      radii: {
        xs: { value: "6px" },
        sm: { value: "8px" },
        md: { value: "10px" },
        lg: { value: "12px" },
        xl: { value: "14px" },
      },
      durations: {
        fast: { value: "120ms" },
        normal: { value: "180ms" },
      },
      easings: {
        standard: { value: "ease" },
      },
      zIndex: {
        sticky: { value: 100 },
        popover: { value: 300 },
        modal: { value: 500 },
        toast: { value: 700 },
        drag: { value: 900 },
      },
    },
    semanticTokens: {
      colors: {
        brand: {
          primary: { value: { base: "{colors.brand.coral}", _dark: "{colors.brand.coralDark}" } },
          onPrimary: { value: { base: "#fffefb", _dark: "#181715" } },
        },
        bg: {
          canvas: { value: { base: "#fffefb", _dark: "#161210" } },
          surface: { value: { base: "rgba(255, 255, 255, 0.94)", _dark: "#1d1815" } },
          panel: { value: { base: "#f6f1ea", _dark: "#201a17" } },
          secondary: { value: { base: "#f6efe7", _dark: "#251e1a" } },
          accent: { value: { base: "#ffede8", _dark: "rgba(255, 119, 89, 0.18)" } },
          popover: { value: { base: "#ffffff", _dark: "#1d1815" } },
          elevated: { value: { base: "#ffffff", _dark: "#241d19" } },
          overlay: { value: { base: "rgba(20, 17, 16, 0.36)", _dark: "rgba(0, 0, 0, 0.62)" } },
        },
        fg: {
          default: { value: { base: "#141110", _dark: "#f6efe7" } },
          muted: { value: { base: "#6f6b64", _dark: "#b5aea4" } },
          subtle: { value: { base: "#8e8b82", _dark: "#8f887f" } },
          disabled: { value: { base: "#8e8b82", _dark: "#77716a" } },
          inverse: { value: { base: "#fffefb", _dark: "#141110" } },
          link: { value: { base: "#a63a2d", _dark: "#ff9e88" } },
          accent: { value: { base: "#252320", _dark: "#ffe7e0" } },
        },
        border: {
          default: { value: { base: "rgba(37, 35, 32, 0.12)", _dark: "rgba(255, 255, 255, 0.10)" } },
          subtle: { value: { base: "rgba(37, 35, 32, 0.08)", _dark: "rgba(255, 255, 255, 0.07)" } },
          input: { value: { base: "#9b918a", _dark: "#77716a" } },
          strong: { value: { base: "#6f6b64", _dark: "#b5aea4" } },
          focus: { value: { base: "#a63a2d", _dark: "#ff9e88" } },
          error: { value: { base: "#b42318", _dark: "#ff9b92" } },
        },
        interaction: {
          selected: { value: { base: "#ffede8", _dark: "rgba(255, 119, 89, 0.18)" } },
          hoverOverlay: { value: { base: "#5c3429", _dark: "#ff8d73" } },
          focusRing: { value: { base: "#a63a2d", _dark: "#ff9e88" } },
        },
        status: {
          error: { value: { base: "#ff5f56", _dark: "#ff796f" } },
          errorSurface: { value: { base: "#fff0ee", _dark: "rgba(255, 121, 111, 0.14)" } },
          errorBorder: { value: { base: "#d92d20", _dark: "#ff9b92" } },
          errorFg: { value: { base: "#8f1d15", _dark: "#ffb4ad" } },
          warning: { value: { base: "#ffbd2e", _dark: "#ffd15d" } },
          warningSurface: { value: { base: "#fff8df", _dark: "rgba(255, 209, 93, 0.13)" } },
          warningBorder: { value: { base: "#b77900", _dark: "#ffd978" } },
          warningFg: { value: { base: "#704800", _dark: "#ffe19a" } },
          success: { value: { base: "#27c93f", _dark: "#27cf8d" } },
          successSurface: { value: { base: "#ebfbed", _dark: "rgba(39, 207, 141, 0.13)" } },
          successBorder: { value: { base: "#168a2b", _dark: "#62dfa9" } },
          successFg: { value: { base: "#116b22", _dark: "#8be8bf" } },
          info: { value: { base: "#6193fd", _dark: "#6b82ff" } },
          infoSurface: { value: { base: "#edf3ff", _dark: "rgba(107, 130, 255, 0.14)" } },
          infoBorder: { value: { base: "#3569d4", _dark: "#91a3ff" } },
          infoFg: { value: { base: "#244b9b", _dark: "#b3c0ff" } },
          onSolid: { value: "#ffffff" },
        },
      },
      shadows: {
        xs: { value: { base: "0 1px 4px rgba(31, 15, 10, 0.04)", _dark: "0 1px 4px rgba(0, 0, 0, 0.26)" } },
        sm: { value: { base: "0 4px 14px rgba(31, 15, 10, 0.06)", _dark: "0 4px 14px rgba(0, 0, 0, 0.32)" } },
        md: { value: { base: "0 10px 30px rgba(31, 15, 10, 0.08)", _dark: "0 10px 30px rgba(0, 0, 0, 0.38)" } },
        lg: { value: { base: "0 18px 54px rgba(31, 15, 10, 0.10)", _dark: "0 18px 54px rgba(0, 0, 0, 0.46)" } },
        interactive: { value: { base: "3px 4px 0 rgba(92, 52, 41, 0.1)", _dark: "3px 4px 0 rgba(255, 141, 115, 0.18)" } },
      },
    },
    recipes: {
      workbenchButton: workbenchButtonRecipe,
      workbenchField: workbenchFieldRecipe,
    },
  },
  globalCss: {
    "html, body": {
      bg: "bg.canvas",
      color: "fg.default",
      fontSynthesisWeight: "none",
      lineHeight: "1.5",
    },
    "::selection": { bg: "interaction.selected" },
  },
});

export const designSystem = createSystem(defaultConfig, designSystemConfig);
