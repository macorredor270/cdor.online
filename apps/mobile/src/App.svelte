<script lang="ts">
  import { onMount } from "svelte";
  import { ulid } from "ulid";
  import type { Memory } from "@cdor/contracts";
  import { mobileBridge, type SyncStatus } from "./bridge";
  import BottomNav from "./features/BottomNav.svelte";
  import ChatView from "./features/ChatView.svelte";
  import Login from "./features/Login.svelte";
  import MemoriesView from "./features/MemoriesView.svelte";
  import SettingsView from "./features/SettingsView.svelte";
  import {
    createConversation,
    createMemory,
    createUserMessage,
    updateMemory
  } from "./operations";
  import { MobileState } from "./state/mobile.svelte";

  const mobile = new MobileState();
  let syncStatus = $state<SyncStatus | null>(null);
  let theme = $state<"system" | "light" | "dark">("system");
  let activeRequest:
    | ReturnType<typeof createUserMessage>
    | null = null;
  let requestStarted = false;

  const conversations = $derived(
    mobile.conversationOrder
      .map((id) => mobile.conversations[id])
      .filter((item) => item !== undefined)
  );
  const memories = $derived(
    mobile.memoryOrder
      .map((id) => mobile.memories[id])
      .filter((item) => item !== undefined)
  );

  function setTheme(value: "system" | "light" | "dark") {
    theme = value;
    localStorage.setItem("cdor-mobile-theme", value);
    document.documentElement.dataset.theme = value;
  }

  async function loadMessages(conversationId: string) {
    const messages = await mobileBridge.messageList(conversationId);
    mobile.setMessages(conversationId, messages);
  }

  async function loadCache(userId: string) {
    const [cachedConversations, cachedMemories] = await Promise.all([
      mobileBridge.conversationList(userId),
      mobileBridge.memoryList(userId)
    ]);
    mobile.setConversations(cachedConversations);
    mobile.setMemories(cachedMemories);
    const selected =
      mobile.activeConversationId ?? cachedConversations[0]?.id ?? null;
    mobile.activeConversationId = selected;
    if (selected) await loadMessages(selected);
  }

  async function refreshSyncStatus() {
    if (!mobile.userId) return;
    syncStatus = await mobileBridge.syncStatus(mobile.userId);
  }

  async function syncNow() {
    if (!mobile.userId || mobile.syncing || !mobile.online) return false;
    mobile.syncing = true;
    mobile.status = "Sincronizando";
    try {
      const report = await mobileBridge.syncNow(mobile.userId);
      await loadCache(mobile.userId);
      await refreshSyncStatus();
      mobile.status =
        report.pushed || report.pulled
          ? `${report.pushed} enviados · ${report.pulled} recibidos`
          : "Todo al día";
      return true;
    } catch {
      mobile.online = navigator.onLine;
      mobile.status = "Pendiente de conexión";
      await refreshSyncStatus().catch(() => undefined);
      return false;
    } finally {
      mobile.syncing = false;
    }
  }

  async function authenticated(userId: string) {
    mobile.authenticated = true;
    mobile.userId = userId;
    mobile.status = "Abriendo caché";
    await loadCache(userId);
    await refreshSyncStatus();
    void syncNow();
  }

  async function boot() {
    try {
      await mobileBridge.databaseOpen();
      const savedTheme = localStorage.getItem("cdor-mobile-theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      } else {
        setTheme("system");
      }
      const session = await mobileBridge.authSession();
      if (session.authenticated && session.userId) {
        await authenticated(session.userId);
      } else {
        mobile.status = "Inicia sesión";
      }
    } catch {
      mobile.status = "No se pudo abrir el almacenamiento local";
    } finally {
      mobile.booting = false;
    }
  }

  async function newConversation() {
    if (!mobile.userId) return;
    const item = createConversation(mobile.userId);
    await mobileBridge.conversationSave(item.entity, item.operation);
    mobile.upsertConversation(item.entity);
    mobile.activeConversationId = item.entity.id;
    mobile.setMessages(item.entity.id, []);
    mobile.status = "Conversación guardada en el dispositivo";
    void syncNow();
  }

  async function selectConversation(id: string) {
    mobile.activeConversationId = id;
    await loadMessages(id);
  }

  async function queueMessage(
    request: ReturnType<typeof createUserMessage>
  ) {
    await mobileBridge.messageSave(request.entity, request.operation);
    mobile.appendMessage(request.entity.conversationId, request.entity);
    mobile.status = "Mensaje en cola";
    await refreshSyncStatus();
  }

  async function sendMessage(content: string, webSearch = false) {
    let conversation = mobile.activeConversation;
    if (!conversation || mobile.streaming) return;

    const request = createUserMessage(conversation, content);
    await mobileBridge.messageCache(request.entity);
    mobile.appendMessage(conversation.id, request.entity);

    if (conversation.syncVersion === "0") {
      await syncNow();
      conversation = mobile.conversations[conversation.id] ?? conversation;
    }
    if (!mobile.online || conversation.syncVersion === "0") {
      await queueMessage(request);
      return;
    }

    activeRequest = request;
    requestStarted = false;
    mobile.streamText = "";
    mobile.streaming = true;
    mobile.status = "Iniciando respuesta";
    try {
      await mobileBridge.chatStart({
        conversationId: conversation.id,
        message: {
          id: request.entity.id,
          clientOperationId: request.operation.operationId,
          content
        },
        modelMode: conversation.modelMode,
        webSearch
      });
    } catch {
      mobile.streaming = false;
      await queueMessage(request);
      activeRequest = null;
    }
  }

  // Regenerar necesita red: no hay mensaje de usuario nuevo que encolar, así
  // que no se añade nada al outbox si falla.
  async function retryMessage(sourceMessageId: string, webSearch = false) {
    const conversation = mobile.activeConversation;
    if (!conversation || mobile.streaming || !mobile.online) return;

    activeRequest = null;
    requestStarted = false;
    mobile.streamText = "";
    mobile.streaming = true;
    mobile.status = "Regenerando respuesta";
    try {
      await mobileBridge.chatRetry({
        conversationId: conversation.id,
        sourceMessageId,
        clientOperationId: ulid(),
        modelMode: conversation.modelMode,
        webSearch
      });
    } catch {
      mobile.streaming = false;
      mobile.status = "No se pudo regenerar la respuesta";
    }
  }

  async function cancelChat() {
    if (!mobile.generationId) return;
    mobile.status = "Cancelando";
    await mobileBridge.chatCancel(mobile.generationId);
  }

  async function addMemory(content: string, category: string) {
    if (!mobile.userId) return;
    const item = createMemory(mobile.userId, content, category);
    await mobileBridge.memorySave(item.entity, item.operation);
    mobile.upsertMemory(item.entity);
    mobile.status = "Memoria guardada en el dispositivo";
    void syncNow();
  }

  async function toggleMemory(memory: Memory) {
    const item = updateMemory(memory, { enabled: !memory.enabled });
    await mobileBridge.memorySave(item.entity, item.operation);
    mobile.upsertMemory(item.entity);
    mobile.status = item.entity.enabled ? "Memoria activada" : "Memoria pausada";
    void syncNow();
  }

  async function logout() {
    if (mobile.streaming && mobile.generationId) {
      await mobileBridge.chatCancel(mobile.generationId).catch(() => undefined);
    }
    await mobileBridge.authSignOut();
    mobile.reset();
    syncStatus = null;
    activeRequest = null;
  }

  onMount(() => {
    let active = true;
    let unlisteners: Array<() => void> = [];
    mobile.online = navigator.onLine;

    const online = () => {
      mobile.online = true;
      void syncNow();
    };
    const offline = () => {
      mobile.online = false;
      mobile.status = "Sin conexión · los cambios quedan en cola";
    };
    const visibility = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);

    void Promise.all([
      mobileBridge.onChatStarted((event) => {
        requestStarted = true;
        mobile.generationId = event.generationId;
        mobile.streamText = "";
        mobile.status = "Respondiendo";
      }),
      mobileBridge.onChatDelta((event) => {
        mobile.streamText += event.text;
      }),
      mobileBridge.onChatUsage((event) => {
        mobile.status = `${event.inputTokens + event.outputTokens} tokens`;
      }),
      mobileBridge.onChatCompleted((event) => {
        const conversationId = event.message.conversationId;
        void mobileBridge.messageCache(event.message).then(() => {
          mobile.appendMessage(conversationId, event.message);
          mobile.streamText = "";
          mobile.streaming = false;
          mobile.generationId = null;
          mobile.status = "Respuesta guardada";
          activeRequest = null;
          requestStarted = false;
          void syncNow();
        });
      }),
      mobileBridge.onChatFailed((event) => {
        const queued = activeRequest;
        const retryable = "retryable" in event && event.retryable;
        mobile.streaming = false;
        mobile.generationId = null;
        mobile.streamText = "";
        mobile.status = retryable ? "Conexión interrumpida" : "No se pudo generar la respuesta";
        if (queued && retryable && !requestStarted) {
          void queueMessage(queued);
        }
        activeRequest = null;
        requestStarted = false;
      }),
      mobileBridge.onSyncState((report) => {
        mobile.status = `${report.pushed} enviados · ${report.pulled} recibidos`;
      })
    ]).then((listeners) => {
      if (active) unlisteners = listeners;
      else listeners.forEach((unlisten) => unlisten());
    });
    void boot();

    return () => {
      active = false;
      unlisteners.forEach((unlisten) => unlisten());
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
    };
  });
</script>

{#if mobile.booting}
  <main class="boot" aria-live="polite">
    <div>✦</div>
    <strong>MAC</strong>
    <span>{mobile.status}</span>
  </main>
{:else if !mobile.authenticated}
  <Login onAuthenticated={authenticated} />
{:else}
  <main class="shell">
    {#if mobile.view === "chat"}
      <ChatView
        {conversations}
        activeConversation={mobile.activeConversation}
        messages={mobile.activeMessages}
        streamText={mobile.streamText}
        streaming={mobile.streaming}
        generationId={mobile.generationId}
        online={mobile.online}
        onNew={newConversation}
        onSelect={selectConversation}
        onSend={sendMessage}
        onRetry={retryMessage}
        onCancel={cancelChat}
      />
    {:else if mobile.view === "memories"}
      <MemoriesView
        {memories}
        syncing={mobile.syncing}
        onCreate={addMemory}
        onToggle={toggleMemory}
      />
    {:else}
      <SettingsView
        online={mobile.online}
        syncing={mobile.syncing}
        status={mobile.status}
        {syncStatus}
        {theme}
        onSync={async () => {
          await syncNow();
        }}
        onTheme={setTheme}
        onLogout={logout}
      />
    {/if}
    <BottomNav view={mobile.view} onChange={(view) => (mobile.view = view)} />
  </main>
{/if}
