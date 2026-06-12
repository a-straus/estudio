import type {
  ConfirmToolRequest,
  ConfirmToolResponse,
  CreateThreadRequest,
  CreateThreadResponse,
  GetThreadResponse,
  ListThreadsResponse,
  PostMessageRequest,
  PostMessageResponse,
} from "@estudio/shared";
import { api } from "../api";
export { ApiError } from "../api";

export function createThread(
  req: CreateThreadRequest,
): Promise<CreateThreadResponse> {
  return api<CreateThreadResponse>("/api/chat/threads", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function listThreads(offset = 0): Promise<ListThreadsResponse> {
  return api<ListThreadsResponse>(`/api/chat/threads?offset=${offset}`);
}

export function getThread(
  threadId: number,
  offset = 0,
): Promise<GetThreadResponse> {
  return api<GetThreadResponse>(
    `/api/chat/threads/${threadId}?offset=${offset}`,
  );
}

export function postMessage(
  threadId: number,
  req: PostMessageRequest,
): Promise<PostMessageResponse> {
  return api<PostMessageResponse>(`/api/chat/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function confirmTool(
  threadId: number,
  messageId: number,
  action: ConfirmToolRequest["action"],
): Promise<ConfirmToolResponse> {
  return api<ConfirmToolResponse>(`/api/chat/threads/${threadId}/tool`, {
    method: "POST",
    body: JSON.stringify({ action, messageId }),
  });
}
