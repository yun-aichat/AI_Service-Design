import type { ReactNode } from "react";

type FieldLabelProps = {
  label: string;
  children: ReactNode;
};

export default function FieldLabel({ label, children }: FieldLabelProps) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {children}
    </label>
  );
}
