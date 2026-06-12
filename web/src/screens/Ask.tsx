import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageView, ChatPageContext, ChatThreadView } from "@estudio/shared";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { TextInput } from "../components/TextInput";
import { Toast } from "../components/Toast";
import { ChatTurn } from "../components/ChatTurn";
import { ToolConfirm } from "../components/ToolConfirm";
import { RecordButton } from "../components/RecordButton";
import {
  ApiError,
  confirmTool,
  createThread,
  deleteThread,
  getThread,
  listThreads,
  postMessage,
  postVoiceMessage,
} from "./askApi";
import "./Ask.css";

interface ToastState {
  text: string;
  variant: "info" | "error";
}

function readContextFromUrl(): ChatPageContext | null {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("kind") as ChatPageContext["kind"] | null;
  const label = params.get("label");
  if (!kind || !label) return null;
  const entityId = params.get("entityId");
  return {
    kind,
    label,
    entityId: entityId ? Number(entityId) : undefined,
  };
}

function readNewFromUrl(): boolean {
  return new URLSearchParams(window.location.search).get("new") === "1";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type View = "list" | "thread";

/**
 * Ask — persistent context-aware chat (design/screens/ask.md).
 * App.tsx wraps this in AppShell. On mobile the thread view is a position:fixed
 * overlay (same technique as Review's active run). At bp-tablet+ it renders as
 * a normal reading column inside the AppShell spine.
 */
export function Ask() {
  const [view, setView] = useState<View>("list");
  const [thread, setThread] = useState<ChatThreadView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [threads, setThreads] = useState<ChatThreadView[]>([]);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState(false);
  const [toolBusy, setToolBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const turnsEndRef = useRef<HTMLDivElement>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const scrollToBottom = useCallback(() => {
    if (turnsEndRef.current && typeof turnsEndRef.current.scrollIntoView === "function") {
      turnsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const loadThreads = useCallback(async (offset = 0) => {
    setLoadingThreads(true);
    try {
      const result = await listThreads(offset);
      if (offset === 0) {
        setThreads(result.threads);
      } else {
        setThreads((prev) => [...prev, ...result.threads]);
      }
      setHasMoreThreads(result.hasMore);
    } catch {
      setToast({ text: "Couldn't load conversations.", variant: "error" });
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const openThread = useCallback(async (id: number) => {
    setLoadingThread(true);
    setView("thread");
    try {
      const result = await getThread(id);
      setThread(result.thread);
      setMessages(result.messages);
      setHasMoreMessages(result.hasMore);
    } catch {
      setToast({ text: "Couldn't load conversation.", variant: "error" });
      setView("list");
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const createNewThread = useCallback(
    async (ctx: ChatPageContext, title: string) => {
      try {
        const result = await createThread({ pageContext: ctx, title });
        setThread(result.thread);
        setMessages([]);
        setHasMoreMessages(false);
        setView("thread");
      } catch {
        setToast({ text: "Couldn't start a conversation.", variant: "error" });
      }
    },
    [],
  );

  useEffect(() => {
    const ctx = readContextFromUrl();
    const wantsNew = readNewFromUrl();
    if (ctx || wantsNew) {
      const pageCtx: ChatPageContext = ctx ?? { kind: "home", label: "Ask" };
      void createNewThread(pageCtx, pageCtx.label);
    } else {
      void loadThreads();
    }
  }, []); // run once on mount

  useEffect(() => {
    if (view === "thread" && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, view, scrollToBottom]);

  const handleSend = useCallback(async () => {
    if (!thread || !inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);
    try {
      const result = await postMessage(thread.id, { content: text });
      setMessages((prev) => [...prev, result.userMessage, result.assistantMessage]);
    } catch {
      setInputText(text);
      setToast({
        text: "Message failed. Check your connection and try again.",
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  }, [thread, inputText, sending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleRecorded = useCallback(
    async (audio: Blob) => {
      if (!thread) return;
      setTranscribing(true);
      setPendingTranscript(true);
      try {
        const result = await postVoiceMessage(thread.id, audio);
        setPendingTranscript(false);
        setMessages((prev) => [...prev, result.userMessage, result.assistantMessage]);
      } catch (err) {
        setPendingTranscript(false);
        const msg =
          err instanceof ApiError
            ? err.message
            : "Voice message failed. Try again.";
        setToast({ text: msg, variant: "error" });
      } finally {
        setTranscribing(false);
      }
    },
    [thread],
  );

  const handleConfirmTool = useCallback(
    async (messageId: number, action: "confirm" | "skip") => {
      if (!thread) return;
      setToolBusy(messageId);
      try {
        const result = await confirmTool(thread.id, messageId, action);
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? result.assistantMessage : m)),
        );
        if (action === "confirm" && result.assistantMessage.toolCall) {
          const term = String(result.assistantMessage.toolCall.args.term ?? "");
          const receiptResult = result.assistantMessage.toolReceipt?.result ?? "";
          const failed = receiptResult.startsWith("Failed");
          const alreadyIn = receiptResult.includes("already in the deck");
          let toastText: string;
          if (failed) {
            toastText = term ? `Couldn't add ${term}.` : "Action failed.";
          } else if (alreadyIn) {
            toastText = term ? `${term} is already in the Spanish deck.` : receiptResult;
          } else {
            toastText = term ? `Added ${term} to the Spanish deck.` : "Action confirmed.";
          }
          setToast({ text: toastText, variant: failed ? "error" : "info" });
        }
      } catch {
        setToast({ text: "Action failed.", variant: "error" });
      } finally {
        setToolBusy(null);
      }
    },
    [thread],
  );

  const handleBack = useCallback(() => {
    setView("list");
    setThread(null);
    setMessages([]);
    void loadThreads();
  }, [loadThreads]);

  const handleDeleteThread = useCallback(
    async (id: number) => {
      try {
        await deleteThread(id);
        setThreads((prev) => prev.filter((t) => t.id !== id));
        if (thread?.id === id) {
          setView("list");
          setThread(null);
          setMessages([]);
        }
      } catch {
        setToast({ text: "Couldn't delete conversation.", variant: "error" });
      }
    },
    [thread],
  );

  // ---- Thread list ----
  if (view === "list") {
    return (
      <div className="ask">
        {toast && (
          <Toast variant={toast.variant} onDismiss={dismissToast}>
            {toast.text}
          </Toast>
        )}
        {loadingThreads && threads.length === 0 ? (
          <p className="ask__loading">Loading conversations…</p>
        ) : threads.length === 0 ? (
          <EmptyState message="No conversations yet. Ask from any page and it starts here." />
        ) : (
          <>
            <ul className="ask__threads-list">
              {threads.map((t) => (
                <li key={t.id} className="ask__thread-row">
                  <button
                    type="button"
                    className="ask__thread-row-open"
                    onClick={() => void openThread(t.id)}
                  >
                    <span className="ask__thread-preview">
                      {t.preview || t.title}
                    </span>
                    <span className="ask__thread-date">
                      {formatDate(t.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ask__thread-delete"
                    aria-label="Delete conversation"
                    onClick={() => void handleDeleteThread(t.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {hasMoreThreads && (
              <Button
                variant="quiet"
                className="ask__load-more"
                onClick={() => void loadThreads(threads.length)}
              >
                Load more
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  // ---- Thread view ----
  const contextLabel = thread?.pageContext?.label ?? "";
  const contextText = contextLabel ? `ASKING ABOUT · ${contextLabel}` : null;

  return (
    <div className="ask__thread-overlay">
      {toast && (
        <Toast variant={toast.variant} onDismiss={dismissToast}>
          {toast.text}
        </Toast>
      )}

      <div className="ask__bar">
        <Button variant="quiet" onClick={handleBack} aria-label="Back">
          ×
        </Button>
        <span className="ask__bar-title">{thread?.title ?? "Ask"}</span>
        <Button variant="quiet" onClick={handleBack}>
          Threads
        </Button>
      </div>

      <div className="ask__turns-scroll">
        <div className="ask__turns">
          {contextText && (
            <p className="ask__context-line">{contextText}</p>
          )}
          {loadingThread ? (
            <p className="ask__loading">Loading…</p>
          ) : (
            <>
            {messages.map((msg) => {
              if (
                msg.role === "assistant" &&
                msg.toolCall?.requiresConfirmation &&
                !msg.toolReceipt
              ) {
                return (
                  <div key={msg.id}>
                    {msg.content && (
                      <ChatTurn role="assistant" content={msg.content} />
                    )}
                    <ToolConfirm
                      toolCall={msg.toolCall}
                      onConfirm={() => void handleConfirmTool(msg.id, "confirm")}
                      onSkip={() => void handleConfirmTool(msg.id, "skip")}
                      busy={toolBusy === msg.id}
                    />
                  </div>
                );
              }
              if (msg.role === "assistant" && msg.toolReceipt && msg.toolCall) {
                return (
                  <div key={msg.id}>
                    {msg.content && (
                      <ChatTurn role="assistant" content={msg.content} />
                    )}
                    <ToolConfirm
                      toolCall={msg.toolCall}
                      toolReceipt={msg.toolReceipt}
                      onConfirm={() => undefined}
                      onSkip={() => undefined}
                    />
                  </div>
                );
              }
              return (
                <ChatTurn key={msg.id} role={msg.role} content={msg.content} />
              );
            })}
            {pendingTranscript && (
              <ChatTurn role="user" content="" state="pending-transcription" />
            )}
            </>
          )}
          <div ref={turnsEndRef} />
        </div>
      </div>

      <div className="ask__composer">
        <div className="ask__composer-input" onKeyDown={handleKeyDown}>
          <TextInput
            label="Ask a question"
            value={inputText}
            onChange={setInputText}
            placeholder="Ask a question…"
            multiline
            disabled={sending}
          />
        </div>
        <span className="ask__composer-mic">
          <RecordButton
            onRecorded={(blob) => void handleRecorded(blob)}
            state={transcribing ? "transcribing" : undefined}
          />
        </span>
        <span className="ask__composer-send">
          <Button
            variant="primary"
            onClick={() => void handleSend()}
            busy={sending}
            busyLabel="Sending…"
            disabled={!inputText.trim()}
            style={{ minHeight: "var(--hit-target)" }}
          >
            Send
          </Button>
        </span>
      </div>
    </div>
  );
}
