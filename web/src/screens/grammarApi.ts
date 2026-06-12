import type {
  GrammarHomeResponse,
  GrammarSeedResponse,
  JobView,
  LessonAnswerRequest,
  LessonAnswerResponse,
  LessonAttemptRequest,
  LessonAttemptResponse,
  LessonGenerateResponse,
  LessonJobResponse,
  LessonResponse,
} from "@estudio/shared";
import { api } from "../api";
export { ApiError } from "../api";

export function fetchGrammar(): Promise<GrammarHomeResponse> {
  return api<GrammarHomeResponse>("/api/grammar");
}

export function seedGrammar(): Promise<GrammarSeedResponse> {
  return api<GrammarSeedResponse>("/api/grammar/seed", { method: "POST" });
}

export function fetchJobs(): Promise<JobView[]> {
  return api<JobView[]>("/api/jobs");
}

export function fetchLesson(topicId: number): Promise<LessonResponse> {
  return api<LessonResponse>(`/api/grammar/topics/${topicId}/lesson`);
}

export function generateLesson(
  topicId: number,
): Promise<LessonGenerateResponse> {
  return api<LessonGenerateResponse>(`/api/grammar/topics/${topicId}/lesson`, {
    method: "POST",
  });
}

export function fetchLessonJob(jobId: number): Promise<LessonJobResponse> {
  return api<LessonJobResponse>(`/api/grammar/lessons/${jobId}`);
}

export function answerLesson(
  req: LessonAnswerRequest,
): Promise<LessonAnswerResponse> {
  return api<LessonAnswerResponse>("/api/grammar/answer", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function submitLessonAttempt(
  req: LessonAttemptRequest,
): Promise<LessonAttemptResponse> {
  return api<LessonAttemptResponse>("/api/grammar/attempt", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
