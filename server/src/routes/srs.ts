import type { Express, Request, Response } from "express";
import type {
  CardSchedulingState,
  DemoteResponse,
  DueQueueItem,
  DueQueueResponse,
  ReviewDirection,
  ReviewGrade,
  SubmitReviewResponse,
} from "@estudio/shared";
import type { DB } from "../db/db.js";
import {
  countPromotedToday,
  deckExists,
  getCardState,
  getDueCards,
  getNewCardsPerDay,
  getNewWords,
  getWordReviewData,
  persistPromotions,
  persistReviewOutcome,
  wordExists,
} from "../db/srs-queries.js";
import { applyManualDemotion, applyReview } from "../srs/sm2.js";
import { buildReviewSession } from "../srs/queue.js";
import type { CardState, SrsWordStatus } from "../srs/types.js";

const GRADES: ReviewGrade[] = ["fail", "good", "easy"];
const DIRECTIONS: ReviewDirection[] = ["w2d", "d2w"];

// Manual demotion has no review direction, but review_log.direction is NOT
// NULL, so we record the default word→def ('w2d') direction.
const DEMOTION_DIRECTION: ReviewDirection = "w2d";

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
    const nowIsoString = now.toISOString();
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

    const body: DueQueueResponse = { deckId, items };
    res.json(body);
  });

  // 2. Grade submission: apply SM-2, update card_state, append review_log.
  app.post("/api/reviews", (req: Request, res: Response) => {
    const body = req.body ?? {};
    const wordId = body.wordId;
    const direction = body.direction;
    const grade = body.grade;

    if (!Number.isInteger(wordId)) {
      error(res, 400, "wordId must be an integer", "invalid_word_id");
      return;
    }
    if (!DIRECTIONS.includes(direction)) {
      error(res, 400, "direction must be 'w2d' or 'd2w'", "invalid_direction");
      return;
    }
    if (!GRADES.includes(grade)) {
      error(res, 400, "grade must be 'fail', 'good' or 'easy'", "invalid_grade");
      return;
    }

    const state = getCardState(db, wordId);
    if (!state) {
      error(res, 404, "No card to review for this word", "no_card_state");
      return;
    }

    const result = applyReview(state, grade as ReviewGrade, new Date());
    persistReviewOutcome(db, {
      nextState: result.nextState,
      logEntry: result.logEntry,
      direction: direction as ReviewDirection,
      newWordStatus: result.newWordStatus,
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
    const state = getCardState(db, wordId);
    if (!state) {
      error(
        res,
        409,
        "Word has no card_state; it has not entered review yet",
        "no_card_state",
      );
      return;
    }

    const result = applyManualDemotion(state, new Date());
    persistReviewOutcome(db, {
      nextState: result.nextState,
      logEntry: result.logEntry,
      direction: DEMOTION_DIRECTION,
      newWordStatus: result.newWordStatus,
    });

    const response: DemoteResponse = {
      card: toSchedulingState(result.nextState, result.newWordStatus),
    };
    res.json(response);
  });
}
