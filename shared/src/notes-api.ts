// Notes API types — learner self-note attached to a quiz question.

export interface Note {
  id: number;
  quizQuestionId: number;
  body: string;
  /** Word term or grammar topic name the question belongs to. */
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  quizQuestionId: number;
  body: string;
}

export interface CreateNoteResponse {
  note: Note;
}

export interface UpdateNoteRequest {
  body: string;
}

export interface UpdateNoteResponse {
  note: Note;
}

export interface ListNotesResponse {
  notes: Note[];
}
