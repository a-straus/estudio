import type { LessonListItem, LessonRecordingView } from "@estudio/shared";
import { api } from "../api";
export { ApiError } from "../api";

export function fetchLessons(): Promise<LessonListItem[]> {
  return api<LessonListItem[]>("/api/lessons");
}

export function fetchLesson(sourceId: number): Promise<LessonRecordingView> {
  return api<LessonRecordingView>(`/api/lessons/${sourceId}`);
}
