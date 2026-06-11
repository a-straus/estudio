import { useEffect } from "react";
import type { ReactNode } from "react";
import "./Toast.css";

const INFO_AUTO_DISMISS_MS = 4000;

interface ToastProps {
  children: ReactNode;
  /** info auto-dismisses after 4s; error persists until dismissed. */
  variant?: "info" | "error";
  /** Optional action, e.g. Undo — an underlined link in the toast text color. */
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
}

/** Toast — transient confirmation, bottom-center. */
export function Toast({
  children,
  variant = "info",
  action,
  onDismiss,
}: ToastProps) {
  useEffect(() => {
    if (variant !== "info") return;
    const timer = setTimeout(onDismiss, INFO_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [variant, onDismiss]);

  return (
    <div
      className={`toast toast--${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {variant === "error" && (
        <span className="toast__dot" aria-hidden="true" />
      )}
      <span className="toast__message">{children}</span>
      {action && (
        <button
          type="button"
          className="toast__action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
      {variant === "error" && (
        <button type="button" className="toast__action" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
