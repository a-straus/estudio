// Suggestions (Phase 2) API request/response + DTOs.

export interface WordSuggestionView {
  type: "word";
  /** suggestion.id — used for the decision endpoint */
  id: number;
  headword: string;
  lemma: string | null;
  language: string;
  partOfSpeech: string | null;
  level: string | null;
  glossEs: string | null;
  glossEn: string | null;
  example: string | null;
  reason: string;
}

export interface TopicSuggestionView {
  type: "grammar_topic";
  /** suggestion.id — used for the decision endpoint */
  id: number;
  /** grammar_topic.id */
  topicId: number;
  name: string;
  /** One-sentence preview of what the topic covers. */
  preview: string;
  reason: string;
}

export type SuggestionView = WordSuggestionView | TopicSuggestionView;

export interface SuggestionTally {
  /** Total suggestions ever made (all statuses). */
  suggested: number;
  added: number;
  skipped: number;
}

export interface SuggestionNextResponse {
  /** null when the pool is exhausted. */
  suggestion: SuggestionView | null;
  tally: SuggestionTally;
}

export interface SuggestionDecisionRequest {
  action: "add" | "skip";
}

export interface SuggestionDecisionResponse {
  ok: true;
}
