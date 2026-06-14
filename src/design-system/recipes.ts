import { defineRecipe } from "@chakra-ui/react";

const focusRing = {
  outline: "2px solid",
  outlineColor: "interaction.focusRing",
  outlineOffset: "2px",
};

const lift = {
  boxShadow: "interactive",
  transform: "translateY(-1px)",
};

export const workbenchButtonRecipe = defineRecipe({
  className: "workbench-button",
  base: {
    alignItems: "center",
    borderColor: "border.default",
    borderRadius: "md",
    borderWidth: "1px",
    display: "inline-flex",
    fontWeight: "medium",
    gap: "2",
    justifyContent: "center",
    minH: "10",
    px: "4",
    transition: "background {durations.normal} {easings.standard}, border-color {durations.normal} {easings.standard}, color {durations.normal} {easings.standard}, box-shadow {durations.normal} {easings.standard}, transform {durations.normal} {easings.standard}",
    _focusVisible: focusRing,
    _disabled: { boxShadow: "none", cursor: "not-allowed", opacity: "0.45", transform: "none" },
  },
  variants: {
    visual: {
      primary: {
        bg: "brand.primary",
        borderColor: "brand.primary",
        color: "brand.onPrimary",
        _hover: {
          ...lift,
          bg: "color-mix(in srgb, var(--chakra-colors-brand-primary) 92%, var(--chakra-colors-fg-default))",
        },
        _active: { boxShadow: "none", transform: "translateY(0)" },
      },
      secondary: {
        bg: "bg.secondary",
        borderColor: "border.default",
        color: "fg.default",
        _hover: {
          bg: "color-mix(in srgb, var(--chakra-colors-bg-secondary) 92%, var(--chakra-colors-fg-default))",
          boxShadow: "interactive",
          borderColor: "color-mix(in srgb, var(--chakra-colors-brand-primary) 12%, var(--chakra-colors-border-default))",
          transform: "translateY(-1px)",
        },
        _active: { boxShadow: "none", transform: "translateY(0)" },
      },
      outline: {
        bg: "bg.surface",
        color: "fg.default",
        _hover: { ...lift, bg: "bg.accent", borderColor: "brand.primary" },
        _active: { boxShadow: "none", transform: "translateY(0)" },
      },
      danger: {
        bg: "status.error",
        borderColor: "status.error",
        color: "brand.onPrimary",
        _hover: { ...lift, bg: "color-mix(in srgb, var(--chakra-colors-status-error) 90%, var(--chakra-colors-fg-default))" },
        _active: { boxShadow: "none", transform: "translateY(0)" },
      },
    },
    density: {
      compact: { fontSize: "xs", minH: "8", px: "3" },
      comfortable: { fontSize: "sm", minH: "10", px: "4" },
    },
  },
  defaultVariants: { density: "comfortable", visual: "secondary" },
});
export const workbenchFieldRecipe = defineRecipe({
  className: "workbench-field",
  base: {
    bg: "bg.surface",
    borderColor: "border.default",
    borderRadius: "md",
    borderWidth: "1px",
    color: "fg.default",
    minH: "10",
    px: "3",
    transition: "background {durations.normal} {easings.standard}, border-color {durations.normal} {easings.standard}, box-shadow {durations.normal} {easings.standard}",
    _placeholder: { color: "fg.muted" },
    _hover: { borderColor: "color-mix(in srgb, var(--chakra-colors-brand-primary) 18%, var(--chakra-colors-border-default))" },
    _focusVisible: {
      borderColor: "brand.primary",
      boxShadow: "0 0 0 3px color-mix(in srgb, var(--chakra-colors-brand-primary) 18%, transparent)",
      outline: "none",
    },
    _disabled: { bg: "bg.canvas", cursor: "not-allowed", opacity: "0.55" },
    _invalid: {
      borderColor: "border.error",
      boxShadow: "0 0 0 1px var(--chakra-colors-status-error)",
    },
  },
  variants: {
    density: {
      compact: { fontSize: "xs", minH: "8" },
      comfortable: { fontSize: "sm", minH: "10" },
    },
  },
  defaultVariants: { density: "comfortable" },
});
