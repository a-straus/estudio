import type { Express, Request, Response } from "express";
import type {
  ConfirmToolRequest,
  CreateThreadRequest,
  PostMessageRequest,
} from "@estudio/shared";
import type { DB } from "../db/db.js";
import {
  createThread,
  getMessage,
  getThread,
  insertMessage,
  listMessages,
  listThreads,
  updateMessageToolCalls,
} from "../db/chat-queries.js";
import type { LlmService } from "../llm/service.js";
import { logger } from "../logger.js";

function error(res: Response, status: number, message: string, code: string) {
  res.status(status).json({ error: { message, code } });
}

/** Parse the model's optional ```tool\n{...}\n``` block from the end of a response. */
function parseToolCall(
  text: string,
): { toolName: string; args: Record<string, string | number> } | null {
  const match = text.match(/```tool\s*\n([\s\S]*?)\n```\s*$/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as {
      tool?: string;
      args?: Record<string, string | number>;
    };
    if (!parsed.tool) return null;
    return { toolName: parsed.tool, args: parsed.args ?? {} };
  } catch {
    return null;
  }
}

/** Strip the ```tool block from the assistant reply text so it's not shown. */
function stripToolBlock(text: string): string {
  return text.replace(/```tool\s*\n[\s\S]*?\n```\s*$/, "").trimEnd();
}

const MUTATION_TOOLS = new Set(["add_word_to_deck"]);

/** Serialize thread history for the prompt template. */
function serializeHistory(
  messages: { role: string; content: string }[],
): string {
  if (messages.length === 0) return "(no messages yet)";
  return messages
    .map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`)
    .join("\n\n");
}

const TOOLS_SPEC = `- add_word_to_deck: Add a Spanish word to the learner's vocabulary deck (MUTATION — requires confirmation).
- lookup_word: Look up a word already in the learner's vocabulary (read-only — runs silently).
- get_page_context: Get details about the current page entity (read-only — runs silently).`;

/**
 * Execute a read-only tool silently and return a brief result string.
 */
function executeReadTool(
  db: DB,
  toolName: string,
  args: Record<string, string | number>,
): string {
  if (toolName === "lookup_word") {
    const term = String(args.term ?? "");
    const row = db
      .prepare(
        `SELECT term, definition_es, definition_en, part_of_speech, level
           FROM word WHERE term = ? OR term_normalized = ? LIMIT 1`,
      )
      .get(term, term.toLowerCase()) as
      | {
          term: string;
          definition_es: string | null;
          definition_en: string | null;
          part_of_speech: string | null;
          level: string | null;
        }
      | undefined;
    if (!row) return `"${term}" not found in vocabulary.`;
    const def = row.definition_en ?? row.definition_es ?? "no definition";
    return `${row.term} (${row.part_of_speech ?? "?"}): ${def}`;
  }
  if (toolName === "get_page_context") {
    return "Page context retrieved.";
  }
  return "Tool executed.";
}

export function registerChatRoutes(
  app: Express,
  db: DB,
  llm?: LlmService,
): void {
  // POST /api/chat/threads — create a new thread
  app.post(
    "/api/chat/threads",
    (req: Request, res: Response): void => {
      const body = req.body as Partial<CreateThreadRequest>;
      if (!body.pageContext || !body.title) {
        error(res, 400, "pageContext and title are required", "bad_request");
        return;
      }
      const thread = createThread(db, body.pageContext, body.title);
      res.status(201).json({ thread });
    },
  );

  // GET /api/chat/threads — list threads (paginated at 20)
  app.get(
    "/api/chat/threads",
    (req: Request, res: Response): void => {
      const offset = Number(req.query.offset ?? 0);
      const result = listThreads(db, isNaN(offset) ? 0 : offset);
      res.json(result);
    },
  );

  // GET /api/chat/threads/:id — get thread + messages
  app.get(
    "/api/chat/threads/:id",
    (req: Request, res: Response): void => {
      const id = Number(req.params.id);
      const thread = getThread(db, id);
      if (!thread) {
        error(res, 404, "Thread not found", "not_found");
        return;
      }
      const offset = Number(req.query.offset ?? 0);
      const { messages, hasMore } = listMessages(
        db,
        id,
        isNaN(offset) ? 0 : offset,
      );
      res.json({ thread, messages, hasMore });
    },
  );

  // POST /api/chat/threads/:id/messages — user turn → assistant reply
  app.post(
    "/api/chat/threads/:id/messages",
    async (req: Request, res: Response): Promise<void> => {
      const threadId = Number(req.params.id);
      const thread = getThread(db, threadId);
      if (!thread) {
        error(res, 404, "Thread not found", "not_found");
        return;
      }

      const body = req.body as Partial<PostMessageRequest>;
      if (!body.content || body.content.trim() === "") {
        error(res, 400, "content is required", "bad_request");
        return;
      }

      const userMessage = insertMessage(db, threadId, "user", body.content.trim());

      if (!llm) {
        const assistantMessage = insertMessage(
          db,
          threadId,
          "assistant",
          "LLM service unavailable.",
        );
        res.status(201).json({ userMessage, assistantMessage });
        return;
      }

      try {
        const { messages } = listMessages(db, threadId, 0, 50);
        const pageContextLabel = thread.pageContext.label;
        const history = serializeHistory(messages);

        let rawText: string;
        try {
          rawText = await llm.complete("chat", {
            page_context: pageContextLabel,
            history,
            tools: TOOLS_SPEC,
          });
        } catch (err) {
          logger.error("llm", "chat LLM error", { err });
          const failMsg = insertMessage(
            db,
            threadId,
            "assistant",
            "The answer didn't arrive. Send again.",
          );
          res.status(201).json({ userMessage, assistantMessage: failMsg });
          return;
        }

        const parsed = parseToolCall(rawText);
        const displayText = parsed ? stripToolBlock(rawText) : rawText;

        if (parsed) {
          const isReadOnly = !MUTATION_TOOLS.has(parsed.toolName);
          if (isReadOnly) {
            // Execute silently; append tool result to content
            const toolResult = executeReadTool(db, parsed.toolName, parsed.args);
            const combinedContent = displayText
              ? `${displayText}\n\n_[Tool result: ${toolResult}]_`
              : `_[Tool result: ${toolResult}]_`;
            const assistantMessage = insertMessage(
              db,
              threadId,
              "assistant",
              combinedContent,
            );
            res.status(201).json({ userMessage, assistantMessage });
          } else {
            // Mutation — pause for confirmation
            const toolCall = {
              toolName: parsed.toolName as
                | "add_word_to_deck"
                | "lookup_word"
                | "get_page_context",
              args: parsed.args,
              requiresConfirmation: true,
            };
            const assistantMessage = insertMessage(
              db,
              threadId,
              "assistant",
              displayText || "I'd like to take an action:",
              { toolCall },
            );
            res.status(201).json({ userMessage, assistantMessage });
          }
        } else {
          const assistantMessage = insertMessage(
            db,
            threadId,
            "assistant",
            rawText,
          );
          res.status(201).json({ userMessage, assistantMessage });
        }
      } catch (err) {
        logger.error("request", "chat route error", { err });
        error(res, 500, "Internal error", "internal_error");
      }
    },
  );

  // POST /api/chat/threads/:id/tool — confirm or skip a pending mutation
  app.post(
    "/api/chat/threads/:id/tool",
    (req: Request, res: Response): void => {
      const threadId = Number(req.params.id);
      const thread = getThread(db, threadId);
      if (!thread) {
        error(res, 404, "Thread not found", "not_found");
        return;
      }

      const body = req.body as Partial<ConfirmToolRequest> & {
        messageId?: number;
      };
      if (!body.action || !["confirm", "skip"].includes(body.action)) {
        error(res, 400, "action must be 'confirm' or 'skip'", "bad_request");
        return;
      }
      if (!body.messageId) {
        error(res, 400, "messageId is required", "bad_request");
        return;
      }

      const msg = getMessage(db, body.messageId);
      if (!msg || msg.threadId !== threadId || !msg.toolCall) {
        error(res, 404, "Pending tool message not found", "not_found");
        return;
      }

      let result: string | undefined;
      if (body.action === "confirm") {
        const { toolName, args } = msg.toolCall;
        if (toolName === "add_word_to_deck") {
          const term = String(args.term ?? "");
          const deckId = Number(args.deck_id ?? 1);
          const existing = db
            .prepare(
              `SELECT id FROM word WHERE term = ? AND deck_id = ? LIMIT 1`,
            )
            .get(term, deckId);
          if (!existing) {
            try {
              const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
              const termNorm = term
                .toLowerCase()
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "");
              db.prepare(
                `INSERT INTO word (term, term_normalized, language, status, deck_id, created_at, updated_at)
                 VALUES (?, ?, 'es', 'new', ?, ?, ?)`,
              ).run(term, termNorm, deckId, now, now);
              result = `Added "${term}" to deck.`;
            } catch (err) {
              logger.error("request", "add_word_to_deck error", { err });
              result = `Failed to add "${term}".`;
            }
          } else {
            result = `"${term}" is already in the deck.`;
          }
        }
      }

      const receiptStatus: "confirmed" | "skipped" =
        body.action === "confirm" ? "confirmed" : "skipped";
      const toolReceipt = {
        toolName: msg.toolCall.toolName,
        status: receiptStatus,
        result,
      };

      updateMessageToolCalls(db, msg.id, {
        toolCall: msg.toolCall,
        toolReceipt,
      });

      const updated = getMessage(db, msg.id);
      res.json({ assistantMessage: updated });
    },
  );
}
