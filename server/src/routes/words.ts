import type { Express, Request, Response } from "express";
import {
  type CreateWordRequest,
  type UpdateWordRequest,
  type WordLanguage,
  type WordListQuery,
  type WordSort,
  type WordStatus,
} from "@estudio/shared";
import { config } from "../config.js";
import type { DB } from "../db/db.js";
import { createAnthropicProvider } from "../llm/anthropic.js";
import { loadPrompt } from "../llm/prompts.js";
import { LlmService } from "../llm/service.js";
import { LlmError } from "../llm/types.js";
import { logger } from "../logger.js";
import {
  deckExists,
  deleteWord,
  getDefaultDeckId,
  getWordDetail,
  insertWord,
  listWords,
  updateWord,
  wordExistsById,
  wordExistsByTermLanguage,
  type UpdateWordFields,
} from "../db/word-queries.js";

const STATUSES: WordStatus[] = [
  "new",
  "learning",
  "mature",
  "known",
  "suspended",
];
const LANGUAGES: WordLanguage[] = ["es", "en"];
const SORTS: WordSort[] = ["recent", "alpha"];
const DEFINITION_TASK = "word_definition";

function error(
  res: Response,
  status: number,
  message: string,
  code: string,
): void {
  res.status(status).json({ error: { message, code } });
}

/**
 * The LLM-filled fields for a manual word. Loose typing — the model output is
 * validated/coerced at the boundary in `parseDefinition` before it reaches the DB.
 */
interface DefinitionFill {
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
  level: string | null;
}

/** Strip a leading/trailing markdown fence and parse the model's JSON object. */
function parseDefinition(text: string): DefinitionFill {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1)
    throw new Error(`no JSON in definition response: ${text.slice(0, 200)}`);
  const raw = JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  return {
    lemma: str(raw.lemma),
    partOfSpeech: str(raw.partOfSpeech),
    definitionEs: str(raw.definitionEs),
    definitionEn: str(raw.definitionEn),
    example: str(raw.example),
    level: str(raw.level),
  };
}

function defaultLlm(db: DB): LlmService {
  return new LlmService(db, {
    anthropic: createAnthropicProvider(config.anthropicApiKey),
  });
}

// Library/word CRUD routes. Registered in app.ts as registerWordRoutes(app, db);
// the LlmService defaults to the real provider there and is injected (mocked)
// in tests. A single-word definition is a short call, so POST does it inline.
export function registerWordRoutes(
  app: Express,
  db: DB,
  llm: LlmService = defaultLlm(db),
): void {
  // List + search. Accent-insensitive `q`, status/partOfSpeech/deck filters,
  // sort, pagination.
  app.get("/api/words", (req: Request, res: Response) => {
    const { q, status, partOfSpeech, deckId, sort, limit, offset } = req.query;

    if (status !== undefined && !STATUSES.includes(status as WordStatus)) {
      error(res, 400, "Unknown status filter", "invalid_status");
      return;
    }
    if (sort !== undefined && !SORTS.includes(sort as WordSort)) {
      error(res, 400, "Unknown sort", "invalid_sort");
      return;
    }

    const query: WordListQuery = {
      q: typeof q === "string" ? q : undefined,
      status: status as WordStatus | undefined,
      partOfSpeech: typeof partOfSpeech === "string" ? partOfSpeech : undefined,
      deckId: deckId !== undefined ? Number(deckId) : undefined,
      sort: sort as WordSort | undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    };

    res.json(listWords(db, query));
  });

  // Detail: provenance fields + card_state summary + recent review_log.
  app.get("/api/words/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      error(res, 404, "Word not found", "not_found");
      return;
    }
    const detail = getWordDetail(db, id);
    if (!detail) {
      error(res, 404, "Word not found", "not_found");
      return;
    }
    res.json(detail);
  });

  // Manual add. term + language required. If the owner supplied a definition we
  // trust it (origin owner); otherwise one LLM call fills the gaps (origin llm).
  app.post("/api/words", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as CreateWordRequest;
    const term = typeof body.term === "string" ? body.term.trim() : "";
    const language = body.language;

    if (term === "") {
      error(res, 400, "term is required", "invalid_term");
      return;
    }
    if (!LANGUAGES.includes(language)) {
      error(res, 400, "language must be 'es' or 'en'", "invalid_language");
      return;
    }
    if (body.status !== undefined && !STATUSES.includes(body.status)) {
      error(res, 400, "Unknown status", "invalid_status");
      return;
    }

    let deckId = body.deckId;
    if (deckId !== undefined) {
      if (!Number.isInteger(deckId) || !deckExists(db, deckId)) {
        error(res, 400, "Unknown deck", "invalid_deck");
        return;
      }
    } else {
      const fallback = getDefaultDeckId(db, language);
      if (fallback === null) {
        error(res, 400, "No deck for that language", "invalid_deck");
        return;
      }
      deckId = fallback;
    }

    if (wordExistsByTermLanguage(db, term, language)) {
      error(res, 409, "That word is already in your library", "word_exists");
      return;
    }

    const ownerDefined =
      typeof body.definitionEs === "string" ||
      typeof body.definitionEn === "string";

    let fill: DefinitionFill = {
      lemma: body.lemma ?? null,
      partOfSpeech: body.partOfSpeech ?? null,
      definitionEs: body.definitionEs ?? null,
      definitionEn: body.definitionEn ?? null,
      example: body.example ?? null,
      level: body.level ?? null,
    };
    const definitionOrigin: "llm" | "owner" = ownerDefined ? "owner" : "llm";
    let promptVersion: string | null = null;

    if (!ownerDefined) {
      try {
        // vision([]) is the LlmService entry point that fills {{term}}/{{language}}
        // template slots (complete() takes no substitutions); with no attachments
        // it is a plain text completion.
        const text = await llm.vision(DEFINITION_TASK, [], {
          term,
          language,
        });
        const filled = parseDefinition(text);
        // Owner-supplied scalars (lemma/level/pos) still win over the model.
        fill = {
          lemma: fill.lemma ?? filled.lemma,
          partOfSpeech: fill.partOfSpeech ?? filled.partOfSpeech,
          definitionEs: filled.definitionEs,
          definitionEn: filled.definitionEn,
          example: fill.example ?? filled.example,
          level: fill.level ?? filled.level,
        };
        promptVersion = loadPrompt(DEFINITION_TASK).version;
      } catch (err) {
        logger.error("llm", "auto-define failed", { term, err });
        if (err instanceof LlmError) {
          error(res, 502, "Couldn't auto-fill the definition", "llm_failed");
          return;
        }
        throw err;
      }
    }

    const id = insertWord(db, {
      term,
      language,
      lemma: fill.lemma,
      partOfSpeech: fill.partOfSpeech,
      definitionEs: fill.definitionEs,
      definitionEn: fill.definitionEn,
      example: fill.example,
      level: fill.level,
      status: body.status ?? "new",
      deckId,
      definitionOrigin,
      promptVersion,
    });

    res.status(201).json(getWordDetail(db, id));
  });

  // Owner edit. Definition-field changes flip origin → owner + stamp
  // owner_edited_at (handled in the query layer).
  app.patch("/api/words/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !wordExistsById(db, id)) {
      error(res, 404, "Word not found", "not_found");
      return;
    }
    const body = (req.body ?? {}) as UpdateWordRequest;

    if (body.status !== undefined && !STATUSES.includes(body.status)) {
      error(res, 400, "Unknown status", "invalid_status");
      return;
    }

    const fields: UpdateWordFields = {};
    if (body.lemma !== undefined) fields.lemma = body.lemma;
    if (body.partOfSpeech !== undefined)
      fields.partOfSpeech = body.partOfSpeech;
    if (body.definitionEs !== undefined)
      fields.definitionEs = body.definitionEs;
    if (body.definitionEn !== undefined)
      fields.definitionEn = body.definitionEn;
    if (body.example !== undefined) fields.example = body.example;
    if (body.level !== undefined) fields.level = body.level;
    if (body.status !== undefined) fields.status = body.status;

    updateWord(db, id, fields);
    res.json(getWordDetail(db, id));
  });

  // Hard delete. review_log rows survive (FK ON DELETE SET NULL); card_state
  // cascades. Detail/list 404 afterward.
  app.delete("/api/words/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !wordExistsById(db, id)) {
      error(res, 404, "Word not found", "not_found");
      return;
    }
    deleteWord(db, id);
    res.status(204).end();
  });
}
