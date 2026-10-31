import type { Conversation, MessageListData } from "@cdor/contracts";
import { error } from "@sveltejs/kit";
import { ApiClientError, apiRequest } from "#lib/client/api.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params }) => {
  try {
    const [conversation, messages] = await Promise.all([
      apiRequest<Conversation>(
        fetch,
        `/api/v1/conversations/${params.conversationId}`
      ),
      apiRequest<MessageListData>(
        fetch,
        `/api/v1/conversations/${params.conversationId}/messages?limit=50`
      )
    ]);
    return { conversation, messages };
  } catch (cause) {
    // Un identificador mal formado (enlace roto o mal copiado) es, para quien
    // lo abre, lo mismo que una conversación inexistente: 404, no un 500.
    if (
      cause instanceof ApiClientError &&
      (cause.body.code === "CONVERSATION_NOT_FOUND" ||
        cause.body.code === "VALIDATION_ERROR")
    ) {
      error(404, "La conversación no existe");
    }
    throw cause;
  }
};
