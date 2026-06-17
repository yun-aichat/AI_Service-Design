import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import designTokens from "./design-tokens.json";
import { workbenchButtonRecipe, workbenchFieldRecipe } from "./recipes";

export const designSystemConfig = defineConfig({
  cssVarsRoot: ":where(:root, :host)",
  theme: {
    tokens: designTokens.theme.tokens,
    semanticTokens: designTokens.theme.semanticTokens,
    recipes: {
      workbenchButton: workbenchButtonRecipe,
      workbenchField: workbenchFieldRecipe,
    },
  },
  globalCss: {
    ":where(:root, :host)": {
      "--app-shell-header-height": designTokens.layout.header.height,
      "--app-shell-header-gap": designTokens.layout.header.gap,
      "--app-shell-header-padding-inline": designTokens.layout.header.paddingInline,
      "--app-shell-action-min-height": designTokens.layout.header.actionMinHeight,
      "--app-shell-action-radius": designTokens.layout.header.actionRadius,
      "--app-shell-action-gap": designTokens.layout.header.actionGap,
      "--app-workspace-sidebar-width": designTokens.layout.workspace.sidebarWidth,
      "--app-workspace-page-padding": designTokens.layout.workspace.pagePadding,
      "--app-workspace-section-gap": designTokens.layout.workspace.sectionGap,
      "--app-workspace-section-padding-top": designTokens.layout.workspace.sectionPaddingTop,
      "--app-panel-heading-gap": designTokens.layout.workspace.panelHeadingGap,
      "--app-field-gap": designTokens.layout.workspace.fieldGap,
      "--app-field-label-gap": designTokens.layout.workspace.fieldLabelGap,
    },
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
