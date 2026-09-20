import { and, eq, gt, like, lte } from "drizzle-orm";
import { ulid } from "ulid";
import type { Database } from "../client";
import { verification } from "../schema/auth";

const IDENTIFIER_PREFIX = "mobile-oauth:";

export class MobileOAuthRepository {
  constructor(private readonly database: Database) {}

  async store(identifierHash: string, token: string, expiresAt: Date): Promise<void> {
    const now = new Date();
    await this.database
      .delete(verification)
      .where(
        and(
          like(verification.identifier, `${IDENTIFIER_PREFIX}%`),
          lte(verification.expiresAt, now)
        )
      );
    await this.database.insert(verification).values({
      id: ulid(),
      identifier: `${IDENTIFIER_PREFIX}${identifierHash}`,
      value: token,
      expiresAt,
      createdAt: now,
      updatedAt: now
    });
  }

  consume(identifierHash: string, now: Date): Promise<string | null> {
    return this.database.transaction(async (transaction) => {
      const rows = await transaction
        .select({ id: verification.id, token: verification.value })
        .from(verification)
        .where(
          and(
            eq(verification.identifier, `${IDENTIFIER_PREFIX}${identifierHash}`),
            gt(verification.expiresAt, now)
          )
        )
        .limit(1)
        .for("update");
      const handoff = rows[0];
      if (!handoff) return null;
      await transaction
        .delete(verification)
        .where(eq(verification.id, handoff.id));
      return handoff.token;
    });
  }
}
