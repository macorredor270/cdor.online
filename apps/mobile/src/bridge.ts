import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Conversation,
  ChatMessage,
  ChatStreamEvent,
  Memory,
  SyncPushRequest
} from "@cdor/contracts";

export type SessionStatus = Readonly<{
  authenticated: boolean;
  userId: string | null;
}>;
export type SyncStatus = Readonly<{
  cursor: string;
  pending: number;
  failed: number;
}>;
export type SyncReport = Readonly<{
  online: boolean;
  pushed: number;
  pulled: number;
  blocked: number;
  cursor: string;
}>;
export type ChatStarted = Extract<
  ChatStreamEvent,
  { event: "start" }
>["data"];
export type ChatDelta = Extract<
  ChatStreamEvent,
  { event: "delta" }
>["data"];
export type ChatUsage = Extract<
  ChatStreamEvent,
  { event: "usage" }
>["data"];
export type ChatCompleted = Extract<
  ChatStreamEvent,
  { event: "done" }
>["data"];
export type ChatFailure =
  | Extract<ChatStreamEvent, { event: "error" }>["data"]
  | Readonly<{ code: string; retryable: boolean }>;

export type PendingOperation = SyncPushRequest["operations"][number] & {
  entityType: SyncPushRequest["operations"][number]["entity"];
  nextAttemptAtMs: number;
  createdAtMs: number;
  attempts: number;
  lastError: string | null;
};

function nativeOperation(
  operation: SyncPushRequest["operations"][number],
  nowMs: number
): PendingOperation {
  return {
    ...operation,
    entityType: operation.entity,
    nextAttemptAtMs: nowMs,
    createdAtMs: nowMs,
    attempts: 0,
    lastError: null
  };
}

export const mobileBridge = Object.freeze({
  databaseOpen: () => invoke<number>("database_open"),
  authSignIn: (email: string, password: string) =>
    invoke<SessionStatus>("auth_sign_in", {
      input: { email, password }
    }),
  authSignOut: () => invoke<SessionStatus>("auth_sign_out"),
  authSession: () => invoke<SessionStatus>("auth_session"),
  authCompleteOAuth: (code: string, verifier: string) =>
    invoke<SessionStatus>("auth_complete_oauth", { code, verifier }),
  conversationSave: (
    conversation: Conversation,
    operation: SyncPushRequest["operations"][number],
    nowMs = Date.now()
  ) =>
    invoke<void>("conversation_save", {
      conversation,
      operation: nativeOperation(operation, nowMs)
    }),
  conversationGet: (id: string) =>
    invoke<Conversation | null>("conversation_get", { id }),
  conversationList: (userId: string) =>
    invoke<Conversation[]>("conversation_list", { userId }),
  messageSave: (
    message: ChatMessage,
    operation: SyncPushRequest["operations"][number],
    nowMs = Date.now()
  ) =>
    invoke<void>("message_save", {
      message,
      operation: nativeOperation(operation, nowMs)
    }),
  messageCache: (message: ChatMessage) =>
    invoke<void>("message_cache", { message }),
  messageList: (conversationId: string) =>
    invoke<ChatMessage[]>("message_list", { conversationId }),
  memorySave: (
    memory: Memory,
    operation: SyncPushRequest["operations"][number],
    nowMs = Date.now()
  ) =>
    invoke<void>("memory_save", {
      memory,
      operation: nativeOperation(operation, nowMs)
    }),
  memoryList: (userId: string) =>
    invoke<Memory[]>("memory_list", { userId }),
  syncNow: (userId: string, nowMs = Date.now()) =>
    invoke<SyncReport>("sync_now", { userId, nowMs }),
  syncStatus: (userId: string) =>
    invoke<SyncStatus>("sync_status", { userId }),
  chatStart: (input: {
    conversationId: string;
    message: { id: string; clientOperationId: string; content: string };
    modelMode?: string;
    webSearch?: boolean;
  }) => invoke<void>("chat_start", { input }),
  // Regenerar emite los mismos eventos chat://*: la vista no cambia de camino.
  chatRetry: (input: {
    conversationId: string;
    sourceMessageId: string;
    clientOperationId: string;
    modelMode?: string;
    webSearch?: boolean;
  }) => invoke<void>("chat_retry", { input }),
  chatCancel: (generationId: string) =>
    invoke<void>("chat_cancel", { generationId }),
  onSyncState: (handler: (report: SyncReport) => void): Promise<UnlistenFn> =>
    listen<SyncReport>("sync://state", ({ payload }) => handler(payload)),
  onChatStarted: (handler: (event: ChatStarted) => void): Promise<UnlistenFn> =>
    listen<ChatStarted>("chat://started", ({ payload }) => handler(payload)),
  onChatDelta: (handler: (event: ChatDelta) => void): Promise<UnlistenFn> =>
    listen<ChatDelta>("chat://delta", ({ payload }) => handler(payload)),
  onChatUsage: (handler: (event: ChatUsage) => void): Promise<UnlistenFn> =>
    listen<ChatUsage>("chat://usage", ({ payload }) => handler(payload)),
  onChatCompleted: (
    handler: (event: ChatCompleted) => void
  ): Promise<UnlistenFn> =>
    listen<ChatCompleted>("chat://completed", ({ payload }) =>
      handler(payload)
    ),
  onChatFailed: (handler: (event: ChatFailure) => void): Promise<UnlistenFn> =>
    listen<ChatFailure>("chat://failed", ({ payload }) => handler(payload))
});
