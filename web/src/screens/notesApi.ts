import type {
  CreateNoteRequest,
  CreateNoteResponse,
  ListNotesResponse,
  UpdateNoteRequest,
  UpdateNoteResponse,
} from "@estudio/shared";
import { api } from "../api";

export { ApiError } from "../api";

export function listNotes(params: {
  wordId?: number;
  topicId?: number;
  quizQuestionId?: number;
} = {}): Promise<ListNotesResponse> {
  const q = new URLSearchParams();
  if (params.wordId !== undefined) q.set("word_id", String(params.wordId));
  if (params.topicId !== undefined) q.set("topic_id", String(params.topicId));
  if (params.quizQuestionId !== undefined)
    q.set("quiz_question_id", String(params.quizQuestionId));
  const qs = q.toString();
  return api<ListNotesResponse>(`/api/notes${qs ? `?${qs}` : ""}`);
}

export function createNote(req: CreateNoteRequest): Promise<CreateNoteResponse> {
  return api<CreateNoteResponse>("/api/notes", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function updateNote(
  id: number,
  req: UpdateNoteRequest,
): Promise<UpdateNoteResponse> {
  return api<UpdateNoteResponse>(`/api/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(req),
  });
}

export function deleteNote(id: number): Promise<void> {
  return api<void>(`/api/notes/${id}`, { method: "DELETE" });
}
