// CRUD for chat_thread and chat_message. Schema: 003_note_mixed_phase2.sql.

import type {
  ChatMessageRole,
  ChatMessageView,
  ChatPageContext,
  ChatThreadView,
  ChatToolCall,
  ChatToolReceipt,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";

interface ThreadRow {
  id: number;
  page_context: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: number;
  thread_id: number;
  role: ChatMessageRole;
  content: string;
  tool_calls: string | null;
  created_at: string;
  updated_at: string;
}

interface ToolCallsJson {
  toolCall?: ChatToolCall;
  toolReceipt?: ChatToolReceipt;
}

function toThreadView(row: ThreadRow, preview: string): ChatThreadView {
  const pageContext = JSON.parse(row.page_context) as ChatPageContext;
  return {
    id: row.id,
    pageContext,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preview,
  };
}

function toMessageView(row: MessageRow): ChatMessageView {
  const extra: ToolCallsJson = row.tool_calls
    ? (JSON.parse(row.tool_calls) as ToolCallsJson)
    : {};
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    toolCall: extra.toolCall,
    toolReceipt: extra.toolReceipt,
    createdAt: row.created_at,
  };
}

/** Create a new thread; returns its view with empty preview. */
export function createThread(
  db: DB,
  pageContext: ChatPageContext,
  title: string,
): ChatThreadView {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO chat_thread (page_context, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(JSON.stringify(pageContext), title, now, now);
  return {
    id: result.lastInsertRowid as number,
    pageContext,
    title,
    createdAt: now,
    updatedAt: now,
    preview: "",
  };
}

/** List threads newest-first, paginated at 20. */
export function listThreads(
  db: DB,
  offset = 0,
  limit = 20,
): { threads: ChatThreadView[]; hasMore: boolean } {
  const rows = db
    .prepare(
      `SELECT * FROM chat_thread ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(limit + 1, offset) as ThreadRow[];

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const threads = page.map((row) => {
    const firstUser = db
      .prepare(
        `SELECT content FROM chat_message WHERE thread_id = ? AND role = 'user'
         ORDER BY created_at ASC LIMIT 1`,
      )
      .get(row.id) as { content: string } | undefined;
    const preview = firstUser ? firstUser.content.slice(0, 80) : "";
    return toThreadView(row, preview);
  });

  return { threads, hasMore };
}

/** Get a single thread row; null if not found. */
export function getThread(db: DB, threadId: number): ChatThreadView | null {
  const row = db
    .prepare(`SELECT * FROM chat_thread WHERE id = ?`)
    .get(threadId) as ThreadRow | undefined;
  if (!row) return null;

  const firstUser = db
    .prepare(
      `SELECT content FROM chat_message WHERE thread_id = ? AND role = 'user'
       ORDER BY created_at ASC LIMIT 1`,
    )
    .get(threadId) as { content: string } | undefined;
  const preview = firstUser ? firstUser.content.slice(0, 80) : "";
  return toThreadView(row, preview);
}

/** List messages for a thread, oldest-first, paginated. */
export function listMessages(
  db: DB,
  threadId: number,
  offset = 0,
  limit = 50,
): { messages: ChatMessageView[]; hasMore: boolean } {
  const rows = db
    .prepare(
      `SELECT * FROM chat_message WHERE thread_id = ?
       ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
    )
    .all(threadId, limit + 1, offset) as MessageRow[];

  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).map(toMessageView), hasMore };
}

/** Return the most recent N messages for a thread in chronological order (for LLM context window). */
export function listRecentMessages(
  db: DB,
  threadId: number,
  limit = 50,
): ChatMessageView[] {
  const rows = db
    .prepare(
      `SELECT * FROM chat_message WHERE thread_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(threadId, limit) as MessageRow[];
  return rows.reverse().map(toMessageView);
}

/** Insert a new message and return its view. */
export function insertMessage(
  db: DB,
  threadId: number,
  role: ChatMessageRole,
  content: string,
  toolCallsJson?: ToolCallsJson,
): ChatMessageView {
  const now = nowIso();
  const toolCallsStr = toolCallsJson ? JSON.stringify(toolCallsJson) : null;
  const result = db
    .prepare(
      `INSERT INTO chat_message (thread_id, role, content, tool_calls, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(threadId, role, content, toolCallsStr, now, now);

  db.prepare(
    `UPDATE chat_thread SET updated_at = ? WHERE id = ?`,
  ).run(now, threadId);

  return {
    id: result.lastInsertRowid as number,
    threadId,
    role,
    content,
    toolCall: toolCallsJson?.toolCall,
    toolReceipt: toolCallsJson?.toolReceipt,
    createdAt: now,
  };
}

/** Update the tool_calls column of a message (e.g. to store toolReceipt). */
export function updateMessageToolCalls(
  db: DB,
  messageId: number,
  toolCallsJson: ToolCallsJson,
): void {
  const now = nowIso();
  db.prepare(
    `UPDATE chat_message SET tool_calls = ?, updated_at = ? WHERE id = ?`,
  ).run(JSON.stringify(toolCallsJson), now, messageId);
}

/** Get a single message by id; null if not found. */
export function getMessage(db: DB, messageId: number): ChatMessageView | null {
  const row = db
    .prepare(`SELECT * FROM chat_message WHERE id = ?`)
    .get(messageId) as MessageRow | undefined;
  return row ? toMessageView(row) : null;
}
