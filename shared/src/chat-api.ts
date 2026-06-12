// Ask chat (Phase 2) API types.

/** Context about what page/entity the user was looking at when starting a thread. */
export interface ChatPageContext {
  kind: "word" | "review" | "lesson" | "grammar_topic" | "home" | "other";
  /** Human-readable label, e.g. "vergüenza · review card" */
  label: string;
  /** Optional entity id for server-side lookups (word.id, topic.id, etc.) */
  entityId?: number;
}

export interface ChatThreadView {
  id: number;
  pageContext: ChatPageContext;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Last message preview (first 80 chars of first user turn). */
  preview: string;
}

export type ChatMessageRole = "user" | "assistant";

/** A pending tool call the assistant wants to execute. */
export interface ChatToolCall {
  toolName: "add_word_to_deck" | "lookup_word" | "get_page_context";
  args: Record<string, string | number>;
  /** Whether this tool requires user confirmation before executing. */
  requiresConfirmation: boolean;
}

/** After a tool is confirmed/skipped, the server stores a receipt. */
export interface ChatToolReceipt {
  toolName: string;
  status: "confirmed" | "skipped";
  result?: string;
}

export interface ChatMessageView {
  id: number;
  threadId: number;
  role: ChatMessageRole;
  content: string;
  /** Set when the assistant is requesting a tool action. */
  toolCall?: ChatToolCall;
  /** Set after a tool was confirmed or skipped. */
  toolReceipt?: ChatToolReceipt;
  createdAt: string;
}

// ---- Request / response shapes ----

export interface CreateThreadRequest {
  pageContext: ChatPageContext;
  title: string;
}

export interface CreateThreadResponse {
  thread: ChatThreadView;
}

export interface ListThreadsResponse {
  threads: ChatThreadView[];
  hasMore: boolean;
}

export interface GetThreadResponse {
  thread: ChatThreadView;
  messages: ChatMessageView[];
  hasMore: boolean;
}

export interface PostMessageRequest {
  content: string;
}

export interface PostMessageResponse {
  userMessage: ChatMessageView;
  assistantMessage: ChatMessageView;
}

export interface ConfirmToolRequest {
  action: "confirm" | "skip";
}

export interface ConfirmToolResponse {
  assistantMessage: ChatMessageView;
}
