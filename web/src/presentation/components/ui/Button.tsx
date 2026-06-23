import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "interactive inline-flex items-center justify-center gap-2 rounded-xl font-medium select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-offset-2 active:translate-y-px";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-md",
  secondary:
    "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 hover:ring-brand-300",
  ghost: "text-ink-900 hover:bg-brand-50",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md",
};

const sizes: Record<Size, string> = {
  // ≥44px tap target on all sizes (WCAG 2.5.5 / mobile ergonomics)
  md: "min-h-11 px-4 text-base",
  lg: "min-h-14 px-6 text-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
