import { nowIso, type DB } from "../db/db.js";
import {
  getQuizCandidateWords,
  insertQuizQuestion,
  type ClozePayload,
  type DefMatchPayload,
  type QuizCandidateWord,
} from "../db/quiz-queries.js";
import { getDistractorCandidates } from "../db/srs-queries.js";
import { getNotesForWord } from "../db/notes-queries.js";
import { normalize } from "@estudio/shared";
import { loadPrompt } from "../llm/prompts.js";
import { logger } from "../logger.js";
import type { LlmService } from "../llm/service.js";
import type { JobQueue } from "./queue.js";

export const JOB_TYPE_QUIZ_GEN = "quiz_gen";

const DEF_MATCH_PROMPT_VERSION = "def_match/templated/v1";
/** Pull a generous distractor pool so we can find 3 distinct, usable ones. */
const DISTRACTOR_POOL = 12;
const OPTIONS_PER_QUESTION = 4;

/**
 * §6.4: a generic same-level distractor bank (common A1/A2 Spanish vocabulary)
 * appended to the deck-derived pool. It widens def_match options beyond only the
 * user's ingested definitions so answers aren't all repeated glosses, and gives
 * thin decks enough plausible, similar-difficulty choices to fill an option set.
 * The synonym guard below drops any bank entry that collides with the answer.
 */
const DISTRACTOR_BANK: { term: string; definitionEn: string }[] = [
  { term: "casa", definitionEn: "a house" },
  { term: "perro", definitionEn: "a dog" },
  { term: "agua", definitionEn: "water" },
  { term: "libro", definitionEn: "a book" },
  { term: "ciudad", definitionEn: "a city" },
  { term: "comida", definitionEn: "food" },
  { term: "ventana", definitionEn: "a window" },
  { term: "camino", definitionEn: "a road or path" },
  { term: "amigo", definitionEn: "a friend" },
  { term: "trabajo", definitionEn: "work or a job" },
  { term: "tiempo", definitionEn: "time or weather" },
  { term: "mano", definitionEn: "a hand" },
];

export interface QuizGenPayload {
  deckId: number;
  length: number;
  style: "def_match" | "cloze" | "mixed";
  direction: "w2d" | "d2w" | "mixed";
}

export interface QuizGenResult {
  step: number;
  total: number;
  questionIds: number[];
}

export function enqueueQuizGen(queue: JobQueue, payload: QuizGenPayload): number {
  return queue.enqueue(JOB_TYPE_QUIZ_GEN, payload);
}

/** Deterministic LCG-seeded Fisher–Yates so option order is stable but mixed. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  let state = (seed % 2147483647) + 1;
  const next = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Mid-run progress. The queue runs exactly one job at a time (tick guard), so
 * the single running quiz_gen row is this job; updating it lets GET
 * /api/quiz/:jobId/questions show "Writing questions… 12 of 20".
 */
function reportProgress(db: DB, step: number, total: number): void {
  db.prepare(
    "UPDATE job SET progress = ?, updated_at = ? WHERE type = ? AND status = 'running'",
  ).run(JSON.stringify({ step, total }), nowIso(), JOB_TYPE_QUIZ_GEN);
}

function styleForIndex(payload: QuizGenPayload, i: number): "def_match" | "cloze" {
  if (payload.style === "def_match") return "def_match";
  if (payload.style === "cloze") return "cloze";
  return i % 2 === 0 ? "def_match" : "cloze";
}

function directionForIndex(payload: QuizGenPayload, i: number): "w2d" | "d2w" {
  if (payload.direction === "w2d") return "w2d";
  if (payload.direction === "d2w") return "d2w";
  return i % 2 === 0 ? "w2d" : "d2w";
}

function buildDefMatch(
  db: DB,
  deckId: number,
  word: QuizCandidateWord,
  direction: "w2d" | "d2w",
): { payload: DefMatchPayload; explanation: string } | null {
  const definitionEn = word.definitionEn ?? "";
  // w2d: show the term, choose the definition. d2w: show the definition, choose
  // the term. The cue is the side we display; correct is the side they pick.
  const correct = direction === "w2d" ? definitionEn : word.term;
  const cue = direction === "w2d" ? word.term : definitionEn;
  if (!correct.trim() || !cue.trim()) return null;

  // Widen the pool: the user's deck words first (most on-topic), then the
  // generic same-level bank so options aren't all repeated ingested definitions.
  const deckPool = getDistractorCandidates(db, deckId, [word.wordId], DISTRACTOR_POOL);
  const pool: { term: string; definitionEn: string | null }[] = [
    ...deckPool,
    ...DISTRACTOR_BANK,
  ];
  // §6.4 distractor quality: distinct, non-empty, and NEVER a synonym of the
  // correct answer. Compare on normalized text so a same-meaning option (case or
  // accent variant included) can never slip in as a choice.
  const seen = new Set<string>([normalize(correct)]);
  const distractors: string[] = [];
  for (const d of pool) {
    const candidate = direction === "w2d" ? (d.definitionEn ?? "") : d.term;
    const key = normalize(candidate);
    if (candidate.trim() && !seen.has(key)) {
      seen.add(key);
      distractors.push(candidate);
    }
    if (distractors.length >= OPTIONS_PER_QUESTION - 1) break;
  }
  if (distractors.length === 0) return null; // too small a deck for a choice

  const options = seededShuffle([correct, ...distractors], word.wordId);
  return {
    payload: { style: "def_match", direction, cue, options, correct },
    explanation: `${word.term} means ${definitionEn}.`,
  };
}

/**
 * §6.4/§6.7 "never regenerate what is stored": find an existing cached,
 * UNFLAGGED quiz_question that fits this word + style (and, for def_match, the
 * requested direction). Returns the lowest matching id (stable) or null. Flagged
 * rows are excluded so a bad question is never re-served. When this returns an
 * id the generator reuses it instead of building/LLM-calling a fresh one.
 */
function findCachedQuestionId(
  db: DB,
  wordId: number,
  style: "def_match" | "cloze",
  direction: "w2d" | "d2w",
): number | null {
  const rows = db
    .prepare(
      `SELECT id, payload FROM quiz_question
       WHERE word_id = ? AND style = ? AND flagged = 0
       ORDER BY id`,
    )
    .all(wordId, style) as { id: number; payload: string }[];
  for (const r of rows) {
    if (style === "cloze") return r.id; // direction is always 'cloze'
    const payload = JSON.parse(r.payload) as DefMatchPayload;
    if (payload.direction === direction) return r.id;
  }
  return null;
}

interface ClozeLlmJson {
  sentence: string;
  correct: string;
  distractors: string[];
  explanation: string;
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1)
    throw new Error(`no JSON in LLM response: ${text.slice(0, 200)}`);
  return JSON.parse(trimmed.slice(start));
}

function parseCloze(text: string): ClozeLlmJson {
  const parsed = extractJson(text) as Record<string, unknown>;
  if (typeof parsed.sentence !== "string" || !parsed.sentence.includes("____")) {
    throw new Error(`cloze response has no blanked sentence: ${text.slice(0, 200)}`);
  }
  if (typeof parsed.correct !== "string" || parsed.correct.trim() === "") {
    throw new Error(`cloze response has no correct fill: ${text.slice(0, 200)}`);
  }
  if (
    !Array.isArray(parsed.distractors) ||
    parsed.distractors.filter((d) => typeof d === "string" && d.trim()).length === 0
  ) {
    throw new Error(`cloze response has no distractors: ${text.slice(0, 200)}`);
  }
  if (typeof parsed.explanation !== "string" || parsed.explanation.trim() === "") {
    throw new Error(`cloze response has no explanation: ${text.slice(0, 200)}`);
  }
  return {
    sentence: parsed.sentence,
    correct: parsed.correct,
    distractors: (parsed.distractors as unknown[]).filter(
      (d): d is string => typeof d === "string" && d.trim() !== "",
    ),
    explanation: parsed.explanation,
  };
}

function formatNotesBlock(notes: string[]): string {
  if (notes.length === 0) return "";
  return (
    "Learner's own notes on past answers — weight these when choosing what to test:\n" +
    notes.map((n) => `- ${n}`).join("\n") +
    "\n\n"
  );
}

async function buildCloze(
  db: DB,
  llm: LlmService,
  word: QuizCandidateWord,
  promptVersion: string,
): Promise<{ payload: ClozePayload; explanation: string; promptVersion: string }> {
  const notes = getNotesForWord(db, word.wordId);
  const raw = await llm.complete("quiz_cloze", {
    term: word.term,
    lemma: word.lemma ?? word.term,
    partOfSpeech: word.partOfSpeech ?? "",
    definitionEs: word.definitionEs ?? "",
    definitionEn: word.definitionEn ?? "",
    example: word.example ?? "",
    notes: formatNotesBlock(notes),
  });
  const parsed = parseCloze(raw);
  const blank = parsed.sentence.indexOf("____");
  const stemBefore = parsed.sentence.slice(0, blank).trim();
  const stemAfter = parsed.sentence.slice(blank + 4).trim();

  const seen = new Set<string>([parsed.correct]);
  const distractors: string[] = [];
  for (const d of parsed.distractors) {
    if (!seen.has(d)) {
      seen.add(d);
      distractors.push(d);
    }
    if (distractors.length >= OPTIONS_PER_QUESTION - 1) break;
  }
  const options = seededShuffle([parsed.correct, ...distractors], word.wordId);
  return {
    payload: { style: "cloze", stemBefore, stemAfter, options, correct: parsed.correct },
    explanation: parsed.explanation,
    promptVersion,
  };
}

/**
 * Generate a deck quiz: pick `length` eligible words (deterministic), build a
 * def_match and/or cloze question for each, and insert quiz_question rows with
 * their explanation generated eagerly alongside. Reports step/total progress
 * and returns the generated question ids so the route can serve the set.
 */
export async function runQuizGen(
  db: DB,
  llm: LlmService,
  payload: QuizGenPayload,
): Promise<QuizGenResult> {
  const candidates = getQuizCandidateWords(
    db,
    payload.deckId,
    nowIso(),
    payload.length,
  );
  const total = candidates.length;
  const clozePromptVersion = loadPrompt("quiz_cloze").version;
  const questionIds: number[] = [];

  reportProgress(db, 0, total);
  for (let i = 0; i < candidates.length; i++) {
    const word = candidates[i];
    const style = styleForIndex(payload, i);

    if (style === "def_match") {
      const direction = directionForIndex(payload, i);
      // Reuse a cached, unflagged def_match before building a new one.
      const cached = findCachedQuestionId(db, word.wordId, "def_match", direction);
      if (cached !== null) {
        questionIds.push(cached);
      } else {
        const built = buildDefMatch(db, payload.deckId, word, direction);
        if (built) {
          questionIds.push(
            insertQuizQuestion(db, {
              wordId: word.wordId,
              style: "def_match",
              payload: built.payload,
              explanation: built.explanation,
              promptVersion: DEF_MATCH_PROMPT_VERSION,
            }),
          );
        }
      }
    } else {
      // Reuse a cached, unflagged cloze before paying for another LLM call.
      const cached = findCachedQuestionId(db, word.wordId, "cloze", "w2d");
      if (cached !== null) {
        questionIds.push(cached);
      } else {
        const built = await buildCloze(db, llm, word, clozePromptVersion);
        questionIds.push(
          insertQuizQuestion(db, {
            wordId: word.wordId,
            style: "cloze",
            payload: built.payload,
            explanation: built.explanation,
            promptVersion: built.promptVersion,
          }),
        );
      }
    }
    reportProgress(db, i + 1, total);
  }

  logger.info("quiz generated", {
    deckId: payload.deckId,
    requested: payload.length,
    generated: questionIds.length,
  });
  return { step: total, total, questionIds };
}
