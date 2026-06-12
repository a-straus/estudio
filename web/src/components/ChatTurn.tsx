import { Button } from "./Button";
import "./ChatTurn.css";

export type ChatTurnState = "default" | "streaming" | "failed" | "pending-transcription";

interface ChatTurnProps {
  role: "user" | "assistant";
  content: string;
  state?: ChatTurnState;
  onRetry?: () => void;
}

/**
 * One turn in an Ask thread. No bubbles — hairlines only (components.md).
 * User turns are indented; assistant turns are flush left.
 * Spanish spans per bilingual rules rendered inline via the .chat-turn__spanish class.
 */
export function ChatTurn({
  role,
  content,
  state = "default",
  onRetry,
}: ChatTurnProps) {
  if (state === "pending-transcription") {
    return (
      <div className="chat-turn chat-turn--user">
        <span className="chat-turn__label">you</span>
        <p className="chat-turn__pending">Transcribing your question…</p>
      </div>
    );
  }

  if (state === "failed" && role === "assistant") {
    return (
      <div className="chat-turn chat-turn--assistant">
        <div className="chat-turn__failed">
          <span>The answer didn't arrive. Send again.</span>
          {onRetry && (
            <Button variant="quiet" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-turn chat-turn--${role}`}>
      {role === "user" && <span className="chat-turn__label">you</span>}
      <p className="chat-turn__body">{content}</p>
    </div>
  );
}

/** Day separator hairline between turns from different calendar days. */
export function ChatDaySep({ date }: { date: string }) {
  return <div className="chat-day-sep">{date}</div>;
}
