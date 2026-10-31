import type { Conversation } from "@cdor/contracts";

/**
 * Agrupación del historial por antigüedad.
 *
 * Se compara sobre fechas reales normalizadas a medianoche local, no sobre
 * cadenas: `"2026-07-31"` frente a `"2026-07-30"` funciona por casualidad y se
 * rompe en cuanto cambia el huso o el formato.
 */
export type ConversationGroup = Readonly<{
  id: "today" | "yesterday" | "week" | "older";
  label: string;
  items: Conversation[];
}>;

const LABELS = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Esta semana",
  older: "Anteriores"
} as const;

function startOfDay(value: Date): number {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  ).getTime();
}

export function groupConversations(
  conversations: readonly Conversation[],
  now: Date = new Date()
): ConversationGroup[] {
  const today = startOfDay(now);
  const day = 86_400_000;

  const buckets: Record<ConversationGroup["id"], Conversation[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: []
  };

  for (const conversation of conversations) {
    const updated = new Date(conversation.updatedAt);
    if (Number.isNaN(updated.getTime())) {
      buckets.older.push(conversation);
      continue;
    }
    const delta = today - startOfDay(updated);
    if (delta <= 0) buckets.today.push(conversation);
    else if (delta === day) buckets.yesterday.push(conversation);
    else if (delta < 7 * day) buckets.week.push(conversation);
    else buckets.older.push(conversation);
  }

  return (Object.keys(buckets) as ConversationGroup["id"][])
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, label: LABELS[id], items: buckets[id] }));
}

/** Filtro por título sobre lo ya cargado, sin acentos ni mayúsculas. */
export function filterConversations(
  conversations: readonly Conversation[],
  query: string
): Conversation[] {
  const needle = query.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!needle) return [...conversations];
  return conversations.filter((conversation) =>
    conversation.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .includes(needle)
  );
}
