import type {
  ChatMessage,
  Conversation,
  Memory
} from "@cdor/contracts";

export type MobileView = "chat" | "memories" | "settings";

export class MobileState {
  authenticated = $state(false);
  userId = $state("");
  booting = $state(true);
  view = $state<MobileView>("chat");
  online = $state(true);
  syncing = $state(false);
  status = $state("Preparando MAC");
  conversations = $state<Record<string, Conversation>>({});
  conversationOrder = $state<string[]>([]);
  activeConversationId = $state<string | null>(null);
  messages = $state<Record<string, ChatMessage[]>>({});
  memories = $state<Record<string, Memory>>({});
  memoryOrder = $state<string[]>([]);
  streamText = $state("");
  generationId = $state<string | null>(null);
  streaming = $state(false);

  get activeConversation(): Conversation | null {
    return this.activeConversationId
      ? this.conversations[this.activeConversationId] ?? null
      : null;
  }

  get activeMessages(): ChatMessage[] {
    return this.activeConversationId
      ? this.messages[this.activeConversationId] ?? []
      : [];
  }

  setConversations(items: Conversation[]) {
    this.conversations = Object.fromEntries(
      items.map((item) => [item.id, item])
    );
    this.conversationOrder = items.map((item) => item.id);
    if (
      this.activeConversationId &&
      !this.conversations[this.activeConversationId]
    ) {
      this.activeConversationId = null;
    }
  }

  upsertConversation(item: Conversation) {
    this.conversations = { ...this.conversations, [item.id]: item };
    this.conversationOrder = [
      item.id,
      ...this.conversationOrder.filter((id) => id !== item.id)
    ];
  }

  setMessages(conversationId: string, items: ChatMessage[]) {
    this.messages = { ...this.messages, [conversationId]: items };
  }

  appendMessage(conversationId: string, item: ChatMessage) {
    const current = this.messages[conversationId] ?? [];
    const withoutDuplicate = current.filter(
      (message) => message.id !== item.id
    );
    this.messages = {
      ...this.messages,
      [conversationId]: [...withoutDuplicate, item]
    };
  }

  setMemories(items: Memory[]) {
    this.memories = Object.fromEntries(items.map((item) => [item.id, item]));
    this.memoryOrder = items.map((item) => item.id);
  }

  upsertMemory(item: Memory) {
    this.memories = { ...this.memories, [item.id]: item };
    this.memoryOrder = [
      item.id,
      ...this.memoryOrder.filter((id) => id !== item.id)
    ];
  }

  reset() {
    this.authenticated = false;
    this.userId = "";
    this.view = "chat";
    this.conversations = {};
    this.conversationOrder = [];
    this.activeConversationId = null;
    this.messages = {};
    this.memories = {};
    this.memoryOrder = [];
    this.streamText = "";
    this.generationId = null;
    this.streaming = false;
  }
}
