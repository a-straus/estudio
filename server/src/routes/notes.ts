import type { Express, Request, Response } from "express";
import type { CreateNoteRequest, UpdateNoteRequest } from "@estudio/shared";
import type { DB } from "../db/db.js";
import {
  insertNote,
  updateNote,
  deleteNote,
  listNotes,
} from "../db/notes-queries.js";

function error(res: Response, status: number, message: string, code: string) {
  res.status(status).json({ error: { message, code } });
}

export function registerNotesRoutes(app: Express, db: DB): void {
  // GET /api/notes?word_id=&topic_id=&quiz_question_id=
  app.get("/api/notes", (req: Request, res: Response): void => {
    const wordId =
      req.query.word_id !== undefined
        ? Number(req.query.word_id)
        : undefined;
    const topicId =
      req.query.topic_id !== undefined
        ? Number(req.query.topic_id)
        : undefined;
    const quizQuestionId =
      req.query.quiz_question_id !== undefined
        ? Number(req.query.quiz_question_id)
        : undefined;
    res.json({ notes: listNotes(db, { wordId, topicId, quizQuestionId }) });
  });

  // POST /api/notes — create a new note
  app.post("/api/notes", (req: Request, res: Response): void => {
    const body = req.body as Partial<CreateNoteRequest>;
    if (!body.quizQuestionId) {
      error(res, 400, "quizQuestionId is required", "bad_request");
      return;
    }
    if (!body.body || body.body.trim() === "") {
      error(res, 400, "body is required", "bad_request");
      return;
    }
    const note = insertNote(db, {
      quiz_question_id: body.quizQuestionId,
      body: body.body.trim(),
    });
    res.status(201).json({ note });
  });

  // PATCH /api/notes/:id — update body + bump updated_at
  app.patch("/api/notes/:id", (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const body = req.body as Partial<UpdateNoteRequest>;
    if (!body.body || body.body.trim() === "") {
      error(res, 400, "body is required", "bad_request");
      return;
    }
    const note = updateNote(db, id, body.body.trim());
    if (!note) {
      error(res, 404, "Note not found", "not_found");
      return;
    }
    res.json({ note });
  });

  // DELETE /api/notes/:id
  app.delete("/api/notes/:id", (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    if (!deleteNote(db, id)) {
      error(res, 404, "Note not found", "not_found");
      return;
    }
    res.status(204).send();
  });
}
