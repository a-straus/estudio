import type {
  QuizAnswerRequest,
  QuizAnswerResponse,
  QuizAttemptRequest,
  QuizAttemptResponse,
  QuizFlagResponse,
  QuizGenerateRequest,
  QuizGenerateResponse,
  QuizQuestionsResponse,
} from "@estudio/shared";
import { api } from "../api";

export { ApiError } from "../api";

export function generateQuiz(
  req: QuizGenerateRequest,
): Promise<QuizGenerateResponse> {
  return api<QuizGenerateResponse>("/api/quiz/generate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function fetchQuizQuestions(
  jobId: number,
): Promise<QuizQuestionsResponse> {
  return api<QuizQuestionsResponse>(`/api/quiz/${jobId}/questions`);
}

export function answerQuiz(req: QuizAnswerRequest): Promise<QuizAnswerResponse> {
  return api<QuizAnswerResponse>("/api/quiz/answer", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function submitAttempt(
  req: QuizAttemptRequest,
): Promise<QuizAttemptResponse> {
  return api<QuizAttemptResponse>("/api/quiz/attempt", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function flagQuestion(id: number): Promise<QuizFlagResponse> {
  return api<QuizFlagResponse>(`/api/quiz/questions/${id}/flag`, {
    method: "POST",
  });
}
