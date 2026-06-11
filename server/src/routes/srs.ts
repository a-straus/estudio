import type { Express, Request, Response } from "express";
import type {
  CardSchedulingState,
  ClozeReviewItem,
  DemoteResponse,
  DueQueueItem,
  DueQueueResponse,
  DueQueueWithClozeResponse,
  ReviewDirection,
  ReviewGrade,
  SubmitReviewResponse,
} from "@estudio/shared";
import { nowIso, type DB } from "../db/db.js";
import {
  countPromotedToday,
  deckExists,
  getCardState,
  getClozeReviewsForWords,
  getDistractorCandidates,
  getDueCards,
  getNewCardsPerDay,
  getNewWords,
  getWordReviewData,
  persistPromotions,
  persistReviewOutcome,
  toSecondPrecision,
  wordExists,
} from "../db/srs-queries.js";
import { applyManualDemotion, applyReview } from "../srs/sm2.js";
import { buildReviewSession, INITIAL_EASE } from "../srs/queue.js";
import type { CardState, ReviewResult, SrsWordStatus } from "../srs/types.js";

const GRADES: ReviewGrade[] = ["fail", "good", "easy"];
const DIRECTIONS: ReviewDirection[] = ["w2d", "d2w"];

// Manual demotion has no review direction, but review_log.direction is NOT
// NULL, so we record the default word→def ('w2d') direction.
const DEMOTION_DIRECTION: ReviewDirection = "w2d";

// Spare distractors shipped with a too-small queue (see DueQueueResponse).
const DISTRACTOR_POOL_SIZE = 8;

/** SM-2 emits ms-precision timestamps; clamp them to the project convention. */
function atSecondPrecision(result: ReviewResult): ReviewResult {
  return {
    ...result,
    nextState: {
      ...result.nextState,
      due_at: toSecondPrecision(result.nextState.due_at),
    },
    logEntry: { ...result.logEntry, ts: toSecondPrecision(result.logEntry.ts) },
  };
}

function error(res: Response, status: number, message: string, code: string) {
  res.status(status).json({ error: { message, code } });
}

function toSchedulingState(
  state: CardState,
  status: SrsWordStatus,
): CardSchedulingState {
  return {
    wordId: state.word_id,
    ease: state.ease,
    intervalDays: state.interval_days,
    dueAt: state.due_at,
    reps: state.reps,
    status,
  };
}

// SRS routes (due queue, grade submission, manual demotion). Registered by the
// orchestrator in app.ts; this fills the stub in.
export function registerSrsRoutes(app: Express, db: DB): void {
  // 1. Today's review queue for a deck: due cards + new-card promotions.
  app.get("/api/decks/:id/due", (req: Request, res: Response) => {
    const deckId = Number(req.params.id);
    if (!Number.isInteger(deckId) || !deckExists(db, deckId)) {
      error(res, 404, "Deck not found", "not_found");
      return;
    }

    const now = new Date();
    const nowIsoString = nowIso();
    const dueCards = getDueCards(db, deckId, nowIsoString);
    const newWords = getNewWords(db, deckId);
    const session = buildReviewSession({
      dueCards,
      newWords,
      newCardsPerDay: getNewCardsPerDay(db),
      alreadyPromotedToday: countPromotedToday(db, deckId, nowIsoString),
      now,
      rng: Math.random,
    });

    // Promotion writes card_state + status updates in a transaction.
    persistPromotions(db, session.promotions, nowIsoString);

    const wordData = getWordReviewData(
      db,
      session.queue.map((c) => c.word_id),
    );
    const items: DueQueueItem[] = session.queue.map((card) => {
      const w = wordData.get(card.word_id)!;
      return {
        wordId: w.wordId,
        term: w.term,
        lemma: w.lemma,
        partOfSpeech: w.partOfSpeech,
        definitionEs: w.definitionEs,
        definitionEn: w.definitionEn,
        example: w.example,
        direction: session.perCardDirection[card.word_id],
      };
    });

    const body: DueQueueWithClozeResponse = { deckId, items };

    // A small queue can't fill 3 multiple-choice distractors by itself —
    // ship spares from the rest of the deck so the client only falls back
    // to flip cards when the DECK is too small.
    const usableDefinitions = items.filter((i) => i.definitionEn).length;
    if (items.length > 0 && (items.length < 4 || usableDefinitions < 4)) {
      body.distractors = getDistractorCandidates(
        db,
        deckId,
        items.map((i) => i.wordId),
        DISTRACTOR_POOL_SIZE,
      );
    }

    // review-02 #8: where a due word has a cached unflagged cloze question,
    // offer it as an optional cloze-rendered review. Additive — words without
    // one keep the existing MC/flip behavior.
    const clozeReviews: ClozeReviewItem[] = getClozeReviewsForWords(
      db,
      items.map((i) => i.wordId),
    );
    if (clozeReviews.length > 0) body.clozeReviews = clozeReviews;

    res.json(body);
  });

  // 2. Grade submission: apply SM-2, update card_state, append review_log.
  app.post("/api/reviews", (req: Request, res: Response) => {
    const body = req.body ?? {};
    const wordId = body.wordId;
    const direction = body.direction;
    const grade = body.grade;
    // review-02 #8: a review rendered from a cached cloze quiz_question logs
    // direction 'cloze' and carries the quiz_question_id.
    const quizQuestionId = Number.isInteger(body.quizQuestionId)
      ? (body.quizQuestionId as number)
      : null;
    const clozeReview = quizQuestionId !== null && direction === "cloze";

    if (!Number.isInteger(wordId)) {
      error(res, 400, "wordId must be an integer", "invalid_word_id");
      return;
    }
    if (!clozeReview && !DIRECTIONS.includes(direction)) {
      error(res, 400, "direction must be 'w2d' or 'd2w'", "invalid_direction");
      return;
    }
    if (!GRADES.includes(grade)) {
      error(
        res,
        400,
        "grade must be 'fail', 'good' or 'easy'",
        "invalid_grade",
      );
      return;
    }

    const state = getCardState(db, wordId);
    if (!state) {
      error(res, 404, "No card to review for this word", "no_card_state");
      return;
    }

    const result = atSecondPrecision(
      applyReview(state, grade as ReviewGrade, new Date()),
    );
    persistReviewOutcome(db, {
      nextState: result.nextState,
      logEntry: result.logEntry,
      direction: clozeReview ? "cloze" : (direction as ReviewDirection),
      newWordStatus: result.newWordStatus,
      quizQuestionId: clozeReview ? quizQuestionId : null,
    });

    const response: SubmitReviewResponse = {
      card: toSchedulingState(result.nextState, result.newWordStatus),
    };
    res.json(response);
  });

  // 3. Manual demotion ("I forgot this"): due now, interval reset, ease −1 step.
  app.post("/api/words/:id/demote", (req: Request, res: Response) => {
    const wordId = Number(req.params.id);
    if (!Number.isInteger(wordId) || !wordExists(db, wordId)) {
      error(res, 404, "Word not found", "not_found");
      return;
    }
    // "I forgot this" works on ANY library word: a word that never entered
    // review (e.g. triaged 'know') gets a card created at the demoted ease,
    // due now, and flips to 'learning' — same outcome as an existing card.
    const existing = getCardState(db, wordId);
    const state: CardState = existing ?? {
      word_id: wordId,
      ease: INITIAL_EASE,
      interval_days: 0,
      due_at: nowIso(),
      reps: 0,
    };

    const result = atSecondPrecision(applyManualDemotion(state, new Date()));
    persistReviewOutcome(db, {
      nextState: result.nextState,
      logEntry: result.logEntry,
      direction: DEMOTION_DIRECTION,
      newWordStatus: result.newWordStatus,
      createCardState: existing === null,
    });

    const response: DemoteResponse = {
      card: toSchedulingState(result.nextState, result.newWordStatus),
    };
    res.json(response);
  });
}
