import type {
  ChatMessage,
  Conversation,
  Memory,
  SyncPushOperation
} from "@cdor/contracts";
import { ulid } from "ulid";

export type OfflineEntity<T> = Readonly<{
  entity: T;
  operation: SyncPushOperation;
}>;

export function createConversation(
  userId: string,
  now = new Date()
): OfflineEntity<Conversation> {
  const createdAt = now.toISOString();
  const id = ulid(now.getTime());
  return {
    entity: {
      id,
      userId,
      title: "Nueva conversación",
      modelMode: "balanced",
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      syncVersion: "0"
    },
    operation: {
      operationId: ulid(),
      entityId: id,
      entity: "conversation",
      action: "upsert",
      baseVersion: "0",
      payload: {
        title: "Nueva conversación",
        modelMode: "balanced",
        createdAt
      }
    }
  };
}

export function createUserMessage(
  conversation: Conversation,
  content: string,
  now = new Date()
): OfflineEntity<ChatMessage> {
  const createdAt = now.toISOString();
  const id = ulid(now.getTime());
  const operationId = ulid();
  return {
    entity: {
      id,
      conversationId: conversation.id,
      userId: conversation.userId,
      clientOperationId: operationId,
      role: "user",
      content,
      status: "pending",
      modelProvider: null,
      modelId: null,
      inputTokens: null,
      outputTokens: null,
      finishReason: null,
      errorCode: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      syncVersion: "0"
    },
    operation: {
      operationId,
      entityId: id,
      entity: "message",
      action: "upsert",
      baseVersion: "0",
      payload: {
        conversationId: conversation.id,
        clientOperationId: operationId,
        role: "user",
        content,
        createdAt
      }
    }
  };
}

export function createMemory(
  userId: string,
  content: string,
  category: string,
  now = new Date()
): OfflineEntity<Memory> {
  const createdAt = now.toISOString();
  const id = ulid(now.getTime());
  return {
    entity: {
      id,
      userId,
      content,
      category,
      importance: 3,
      enabled: true,
      sourceMessageId: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      syncVersion: "0"
    },
    operation: {
      operationId: ulid(),
      entityId: id,
      entity: "memory",
      action: "upsert",
      baseVersion: "0",
      payload: {
        content,
        category,
        importance: 3,
        enabled: true,
        sourceMessageId: null
      }
    }
  };
}

export function updateMemory(
  memory: Memory,
  changes: Partial<Pick<Memory, "content" | "category" | "importance" | "enabled">>,
  now = new Date()
): OfflineEntity<Memory> {
  const entity = {
    ...memory,
    ...changes,
    updatedAt: now.toISOString()
  };
  return {
    entity,
    operation: {
      operationId: ulid(),
      entityId: memory.id,
      entity: "memory",
      action: "upsert",
      baseVersion: memory.syncVersion,
      payload: {
        content: entity.content,
        category: entity.category,
        importance: entity.importance,
        enabled: entity.enabled,
        sourceMessageId: entity.sourceMessageId
      }
    }
  };
}
