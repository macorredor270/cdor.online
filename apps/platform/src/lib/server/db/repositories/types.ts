import type { Database } from "../client";

/** Handle que Drizzle entrega dentro de `database.transaction(...)`. */
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export type MutationResult<TEntity> =
  | { kind: "ok"; entity: TEntity }
  | { kind: "not_found" }
  | { kind: "conflict"; currentVersion: bigint };

export type CursorPage<TEntity> = Readonly<{
  items: TEntity[];
  hasMore: boolean;
}>;
