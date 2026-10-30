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
    if (
      cause instanceof ApiClientError &&
      cause.body.code === "CONVERSATION_NOT_FOUND"
    ) {
      error(404, "La conversación no existe");
    }
    throw cause;
  }
};
