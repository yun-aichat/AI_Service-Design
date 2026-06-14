import { chakra, useRecipe } from "@chakra-ui/react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { workbenchButtonRecipe, workbenchFieldRecipe } from "./recipes";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  density?: "compact" | "comfortable";
  visual?: "primary" | "secondary" | "outline" | "danger";
};

export function WorkbenchButton({ density, visual, ...props }: ButtonProps) {
  const recipe = useRecipe({ recipe: workbenchButtonRecipe });
  return <chakra.button css={recipe({ density, visual })} {...props} />;
}
type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  density?: "compact" | "comfortable";
};

export function WorkbenchInput({ density, ...props }: FieldProps) {
  const recipe = useRecipe({ recipe: workbenchFieldRecipe });
  return <chakra.input css={recipe({ density })} {...props} />;
}
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  density?: "compact" | "comfortable";
};

export function WorkbenchTextarea({ density, ...props }: TextareaProps) {
  const recipe = useRecipe({ recipe: workbenchFieldRecipe });
  return <chakra.textarea css={recipe({ density })} minH="24" py="2.5" resize="vertical" {...props} />;
}
