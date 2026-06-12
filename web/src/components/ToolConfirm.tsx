import type { ChatToolCall, ChatToolReceipt } from "@estudio/shared";
import { Button } from "./Button";
import "./ToolConfirm.css";

interface ToolConfirmProps {
  toolCall: ChatToolCall;
  toolReceipt?: ChatToolReceipt;
  onConfirm: () => void;
  onSkip: () => void;
  busy?: boolean;
}

function questionFor(toolCall: ChatToolCall): { before: string; word: string; after: string } {
  if (toolCall.toolName === "add_word_to_deck") {
    const term = String(toolCall.args.term ?? "");
    return {
      before: "Add ",
      word: term,
      after: " to the Spanish deck?",
    };
  }
  return { before: `Run ${toolCall.toolName}?`, word: "", after: "" };
}

/**
 * Inline confirmation card for mutation tools (components.md).
 * Pending: shows question + Add/Skip buttons.
 * Confirmed/skipped: collapses to a receipt line.
 */
export function ToolConfirm({
  toolCall,
  toolReceipt,
  onConfirm,
  onSkip,
  busy = false,
}: ToolConfirmProps) {
  if (toolReceipt) {
    const receiptClass =
      "tool-confirm__receipt" +
      (toolReceipt.status === "skipped" ? " tool-confirm__receipt--skipped" : "");
    const term = String(toolCall.args.term ?? "");
    const text =
      toolCall.toolName === "add_word_to_deck"
        ? `${toolReceipt.status === "confirmed" ? "ADDED" : "SKIPPED"} · ${term} · Spanish deck`
        : `${toolReceipt.status.toUpperCase()} · ${toolCall.toolName}`;
    return <span className={receiptClass}>{text}</span>;
  }

  const { before, word, after } = questionFor(toolCall);
  const verbLabel =
    toolCall.toolName === "add_word_to_deck" ? "Add" : "Confirm";

  return (
    <div className="tool-confirm">
      <p className="tool-confirm__question">
        {before}
        {word && <em className="tool-confirm__word">{word}</em>}
        {after}
      </p>
      <div className="tool-confirm__actions">
        <Button
          variant="primary"
          onClick={onConfirm}
          busy={busy}
          busyLabel={`${verbLabel}ing…`}
          style={{ minHeight: "var(--hit-target)" }}
        >
          {verbLabel}
        </Button>
        <Button
          variant="quiet"
          onClick={onSkip}
          disabled={busy}
          style={{ minHeight: "var(--hit-target)" }}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}
