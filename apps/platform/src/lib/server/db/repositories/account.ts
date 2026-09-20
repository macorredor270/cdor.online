import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { user } from "../schema/auth";

export class AccountRepository {
  constructor(private readonly database: Database) {}

  /**
   * Elimina la fila del usuario. Todas las tablas de dominio y de Better Auth
   * declaran `ON DELETE CASCADE` sobre `user.id`, de modo que conversaciones,
   * mensajes, memorias, preferencias, dispositivos, sesiones, cuentas,
   * generaciones, eventos de uso, cambios de sincronización y claves de
   * idempotencia se suprimen con la misma sentencia.
   */
  async deleteUser(userId: string): Promise<boolean> {
    const existing = await this.database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (existing.length === 0) {
      return false;
    }
    await this.database.delete(user).where(eq(user.id, userId));
    return true;
  }
}
