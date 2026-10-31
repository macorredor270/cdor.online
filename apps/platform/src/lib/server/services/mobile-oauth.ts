import { createHash, randomBytes } from "node:crypto";
import type { MobileOAuthRepository } from "../db/repositories/mobile-oauth";

const HANDOFF_TTL_MS = 2 * 60 * 1_000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("base64url");
}

export class MobileOAuthService {
  constructor(
    private readonly repository: Pick<MobileOAuthRepository, "store" | "consume">
  ) {}

  async create(token: string, challenge: string): Promise<string> {
    const code = randomBytes(32).toString("base64url");
    await this.repository.store(
      `${hashCode(code)}:${challenge}`,
      token,
      new Date(Date.now() + HANDOFF_TTL_MS)
    );
    return code;
  }

  consume(code: string, verifier: string): Promise<string | null> {
    return this.repository.consume(
      `${hashCode(code)}:${hashCode(verifier)}`,
      new Date()
    );
  }
}
