import type { ReactNode } from "react";
import "./EmptyState.css";

interface EmptyStateProps {
  /** One sentence, ending in an invitation (canonical strings in D5). */
  message: string;
  /** The one Button (quiet or secondary) directly under the message. */
  children?: ReactNode;
}

/** EmptyState — centered in the vacated region, never full-screen drama. */
export function EmptyState({ message, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state__message">{message}</p>
      {children}
    </div>
  );
}
