import type { Express, Request, Response } from "express";
import type {
  BulkDecisionResponse,
  ConfirmResponse,
  TriageBatchResponse,
  TriageDecision,
  TriageGroup,
} from "@estudio/shared";
import type { DB } from "../db/db.js";
import { getSource, getSourceCoverage } from "../db/queries.js";
import {
  bulkDecision,
  confirmBatch,
  getBatch,
  resolveDedupe,
  setDecision,
} from "../db/triage-queries.js";

const DECISIONS: TriageDecision[] = ["pending", "know", "learn", "skip"];
const GROUPS: TriageGroup[] = ["probably_new", "may_know"];

function fail(res: Response, status: number, message: string, code: string) {
  res.status(status).json({ error: { message, code } });
}

// Triage routes (extraction-item listing, know/learn/skip, batch confirm,
// dedupe resolution). Registered (already) in app.ts.
export function registerTriageRoutes(app: Express, db: DB): void {
  // List the active (or requested) batch of triage candidates for a source.
  app.get(
    "/api/sources/:id/extraction-items",
    (req: Request, res: Response) => {
      const source = getSource(db, Number(req.params.id));
      if (!source) {
        fail(res, 404, "Source not found", "not_found");
        return;
      }
      let requested: number | undefined;
      if (typeof req.query.batch === "string") {
        const n = Number(req.query.batch);
        if (!Number.isInteger(n) || n < 1) {
          fail(res, 400, "batch must be a positive integer", "invalid_batch");
          return;
        }
        requested = n;
      }
      const batch = getBatch(db, source.id, requested);
      const body: TriageBatchResponse = {
        source: { id: source.id, title: source.title },
        batchNo: batch.batchNo,
        batchCount: batch.batchCount,
        totalInBatch: batch.items.length,
        sortedInBatch: batch.items.filter((it) => it.decision !== "pending")
          .length,
        items: batch.items,
        tally: batch.tally,
      };
      res.json(body);
    },
  );

  // Triage coverage for a source: triaged/total + kept + untested counts.
  // Powers the coverage indicator on the triage screen (GOAL §6.1).
  app.get("/api/sources/:id/coverage", (req: Request, res: Response) => {
    const source = getSource(db, Number(req.params.id));
    if (!source) {
      fail(res, 404, "Source not found", "not_found");
      return;
    }
    res.json(getSourceCoverage(db, source.id));
  });

  // Record (or undo, via 'pending') a single decision.
  app.patch("/api/extraction-items/:id", (req: Request, res: Response) => {
    const decision = req.body?.decision;
    if (!DECISIONS.includes(decision)) {
      fail(
        res,
        400,
        `decision must be one of ${DECISIONS.join(", ")}`,
        "invalid_decision",
      );
      return;
    }
    const result = setDecision(db, Number(req.params.id), decision);
    if (result === "not_found") {
      fail(res, 404, "Extraction item not found", "not_found");
      return;
    }
    if (result === "already_confirmed") {
      fail(
        res,
        409,
        "item is already confirmed and can't be re-decided",
        "already_confirmed",
      );
      return;
    }
    res.json(result);
  });

  // Apply one decision to a whole likely-known group of a batch.
  app.post(
    "/api/sources/:id/extraction-items/bulk-decision",
    (req: Request, res: Response) => {
      const source = getSource(db, Number(req.params.id));
      if (!source) {
        fail(res, 404, "Source not found", "not_found");
        return;
      }
      const { batchNo, group, decision } = req.body ?? {};
      if (!Number.isInteger(batchNo) || batchNo < 1) {
        fail(res, 400, "batchNo must be a positive integer", "invalid_batch");
        return;
      }
      if (!GROUPS.includes(group)) {
        fail(
          res,
          400,
          `group must be one of ${GROUPS.join(", ")}`,
          "invalid_group",
        );
        return;
      }
      if (!DECISIONS.includes(decision)) {
        fail(res, 400, "invalid decision", "invalid_decision");
        return;
      }
      const result = bulkDecision(db, source.id, batchNo, group, decision);
      const body: BulkDecisionResponse = result;
      res.json(body);
    },
  );

  // Confirm a batch: materialize words, surface dedupe hits.
  app.post(
    "/api/sources/:id/extraction-items/confirm",
    (req: Request, res: Response) => {
      const source = getSource(db, Number(req.params.id));
      if (!source) {
        fail(res, 404, "Source not found", "not_found");
        return;
      }
      const { batchNo } = req.body ?? {};
      if (!Number.isInteger(batchNo) || batchNo < 1) {
        fail(res, 400, "batchNo must be a positive integer", "invalid_batch");
        return;
      }
      const batch = getBatch(db, source.id, batchNo);
      if (batch.tally.pending > 0) {
        fail(
          res,
          409,
          "every item must be decided before confirming the batch",
          "batch_incomplete",
        );
        return;
      }
      const body: ConfirmResponse = confirmBatch(db, source.id, batchNo);
      res.json(body);
    },
  );

  // Resolve a single dedupe hit (keep a new word, or merge into the existing).
  app.post(
    "/api/extraction-items/:id/resolve-dedupe",
    (req: Request, res: Response) => {
      const resolution = req.body?.resolution;
      if (resolution !== "keep" && resolution !== "merge") {
        fail(
          res,
          400,
          "resolution must be 'keep' or 'merge'",
          "invalid_resolution",
        );
        return;
      }
      const result = resolveDedupe(db, Number(req.params.id), resolution);
      if (result === "not_found") {
        fail(res, 404, "Extraction item not found", "not_found");
        return;
      }
      if (result === "already_confirmed") {
        fail(res, 409, "item is already confirmed", "already_confirmed");
        return;
      }
      if (result === "not_dedupe") {
        fail(
          res,
          409,
          "item has no pending dedupe collision to resolve",
          "not_dedupe",
        );
        return;
      }
      if (result === "term_taken") {
        fail(
          res,
          409,
          "a word with this exact term already exists; merge instead",
          "term_taken",
        );
        return;
      }
      res.json(result);
    },
  );
}
