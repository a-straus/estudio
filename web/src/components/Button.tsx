import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Busy: label swaps to its "…ing" form and the button disables. */
  busy?: boolean;
  /** Label shown while busy, e.g. "Saving…". */
  busyLabel?: string;
}

export function Button({
  variant = "primary",
  busy = false,
  busyLabel,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={["btn", `btn--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || busy}
      {...rest}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
