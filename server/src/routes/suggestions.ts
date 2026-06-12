import type { Express, Request, Response } from "express";
import type {
  SuggestionDecisionRequest,
  SuggestionNextResponse,
  SuggestionView,
} from "@estudio/shared";
import { normalize } from "@estudio/shared";
import type { DB } from "../db/db.js";
import {
  addWordToDeck,
  gatherCalibrationSignal,
  getAlreadySuggestedKeys,
  getPendingSuggestion,
  getSuggestionById,
  getSuggestionTally,
  insertTopicSuggestion,
  insertWordSuggestion,
  updateSuggestionStatus,
  type TopicPayload,
  type WordPayload,
} from "../db/suggestion-queries.js";
import type { LlmService } from "../llm/service.js";
import { logger } from "../logger.js";

function error(res: Response, status: number, message: string, code: string) {
  res.status(status).json({ error: { message, code } });
}

// ---- LLM response parsing ----

interface WordLlmResult {
  type: "word";
  term: string;
  lemma: string | null;
  language: string;
  partOfSpeech: string | null;
  level: string | null;
  glossEs: string | null;
  glossEn: string | null;
  example: string | null;
  reason: string;
}

interface TopicLlmResult {
  type: "grammar_topic";
  topicId: number;
  name: string;
  preview: string;
  reason: string;
}

type LlmResult = WordLlmResult | TopicLlmResult | { type: "exhausted" };

function parseLlmResult(text: string): LlmResult | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (parsed.type === "exhausted") return { type: "exhausted" };
  if (parsed.type === "word") {
    if (typeof parsed.term !== "string" || !parsed.term.trim()) return null;
    return {
      type: "word",
      term: parsed.term.trim(),
      lemma:
        typeof parsed.lemma === "string" ? parsed.lemma.trim() || null : null,
      language:
        typeof parsed.language === "string" ? parsed.language : "es",
      partOfSpeech:
        typeof parsed.part_of_speech === "string"
          ? parsed.part_of_speech || null
          : null,
      level:
        typeof parsed.level === "string" ? parsed.level || null : null,
      glossEs:
        typeof parsed.gloss_es === "string" ? parsed.gloss_es || null : null,
      glossEn:
        typeof parsed.gloss_en === "string" ? parsed.gloss_en || null : null,
      example:
        typeof parsed.example === "string" ? parsed.example || null : null,
      reason:
        typeof parsed.reason === "string" ? parsed.reason : "new suggestion",
    };
  }
  if (parsed.type === "grammar_topic") {
    if (typeof parsed.topic_id !== "number") return null;
    return {
      type: "grammar_topic",
      topicId: parsed.topic_id,
      name: typeof parsed.name === "string" ? parsed.name : "",
      preview: typeof parsed.preview === "string" ? parsed.preview : "",
      reason:
        typeof parsed.reason === "string" ? parsed.reason : "new suggestion",
    };
  }
  return null;
}

/**
 * Try to insert the LLM result into the suggestion table.
 * Returns the SuggestionView on success, null on collision/invalid.
 */
function tryInsert(db: DB, result: LlmResult): SuggestionView | null {
  if (result.type === "exhausted") return null;
  if (result.type === "word") {
    const payload: WordPayload = {
      term: result.term,
      lemma: result.lemma,
      language: result.language,
      partOfSpeech: result.partOfSpeech,
      level: result.level,
      glossEs: result.glossEs,
      glossEn: result.glossEn,
      example: result.example,
      reason: result.reason,
    };
    return insertWordSuggestion(db, payload);
  }
  const payload: TopicPayload = {
    topicId: result.topicId,
    name: result.name,
    preview: result.preview,
    reason: result.reason,
  };
  return insertTopicSuggestion(db, payload);
}

/**
 * Build LLM substitutions from the calibration signal and already-suggested
 * list.
 */
function buildSubstitutions(
  db: DB,
): Record<string, string> {
  const signal = gatherCalibrationSignal(db);
  const alreadySuggested = getAlreadySuggestedKeys(db);
  return {
    deck_word_count: String(signal.deckWordCount),
    deck_words: signal.deckWords.join(", ") || "(none yet)",
    grammar_topics:
      signal.grammarTopics.length > 0
        ? signal.grammarTopics
            .map(
              (t) =>
                `{"id":${t.id},"name":${JSON.stringify(t.name)},"mastery":${t.mastery.toFixed(2)}}`,
            )
            .join(", ")
        : "(none seeded)",
    already_suggested:
      alreadySuggested.length > 0
        ? alreadySuggested
            .map((k) => `{"type":${JSON.stringify(k.type)},"key":${JSON.stringify(k.key)}}`)
            .join(", ")
        : "(none)",
  };
}

export function registerSuggestionRoutes(
  app: Express,
  db: DB,
  llm?: LlmService,
): void {
  // GET /api/suggestions/next — return the current pending suggestion (or
  // generate one via LLM), plus tally counts.
  app.get(
    "/api/suggestions/next",
    async (_req: Request, res: Response, next) => {
      try {
        // Return existing pending suggestion if present.
        let suggestion: SuggestionView | null = getPendingSuggestion(db);

        if (!suggestion && llm) {
          const subs = buildSubstitutions(db);
          // Try up to 3 LLM calls to get a non-colliding suggestion.
          for (let attempt = 0; attempt < 3 && !suggestion; attempt++) {
            let text: string;
            try {
              text = await llm.complete("suggestion_select", subs);
            } catch (err) {
              logger.error("llm", "suggestion_select failed", { err });
              // Surface LLM errors as 500.
              return next(err);
            }
            const parsed = parseLlmResult(text);
            if (!parsed || parsed.type === "exhausted") break;
            suggestion = tryInsert(db, parsed);
          }
        }

        const tally = getSuggestionTally(db);
        const body: SuggestionNextResponse = { suggestion, tally };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/suggestions/:id/decision — record add or skip permanently.
  app.post(
    "/api/suggestions/:id/decision",
    (req: Request, res: Response, next) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          return error(res, 400, "invalid suggestion id", "invalid_id");
        }

        const row = getSuggestionById(db, id);
        if (!row) {
          return error(res, 404, "suggestion not found", "not_found");
        }
        if (row.status !== "pending") {
          return error(res, 409, "suggestion already decided", "already_decided");
        }

        const body = req.body as SuggestionDecisionRequest;
        if (body.action !== "add" && body.action !== "skip") {
          return error(res, 400, "action must be 'add' or 'skip'", "invalid_action");
        }

        if (body.action === "add" && row.item_type === "word") {
          const payload = JSON.parse(row.payload) as WordPayload;
          try {
            addWordToDeck(db, payload);
          } catch (err) {
            logger.error("request", "add word from suggestion failed", { id, err });
            return error(res, 500, "Failed to add word to deck", "add_failed");
          }
        }
        // For grammar_topic: topic already exists in grammar_topic table;
        // the practice queue is derived from mastery — no extra action needed.

        const newStatus = body.action === "add" ? "added" : "skipped";
        updateSuggestionStatus(db, id, newStatus);

        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );
}
