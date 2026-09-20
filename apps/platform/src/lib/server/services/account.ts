import {
  DeleteAccountDataSchema,
  DeleteAccountRequestSchema,
  type DeleteAccountData,
  type DeleteAccountRequest
} from "@cdor/contracts";
import type { Principal } from "../auth/principal";
import type { AccountRepository } from "../db/repositories/account";
import { AppError } from "../errors/app-error";

/** Comprueba la contraseña de la sesión activa sin abrir una sesión nueva. */
export type PasswordVerifier = (
  password: string,
  headers: Headers
) => Promise<boolean>;

export class AccountService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly verifyPassword: PasswordVerifier
  ) {}

  async delete(
    principal: Principal,
    rawRequest: DeleteAccountRequest,
    headers: Headers
  ): Promise<DeleteAccountData> {
    const request = DeleteAccountRequestSchema.parse(rawRequest);

    // La sesión activa no basta para una acción irreversible: un dispositivo
    // desatendido no puede borrar la cuenta sin conocer la contraseña.
    const verified = await this.verifyPassword(request.password, headers);
    if (!verified) {
      throw new AppError("FORBIDDEN", "La contraseña no es correcta");
    }

    const deleted = await this.repository.deleteUser(principal.userId);
    if (!deleted) {
      throw new AppError("RESOURCE_NOT_FOUND", "La cuenta ya no existe");
    }

    return DeleteAccountDataSchema.parse({
      deleted: true,
      deletedAt: new Date().toISOString()
    });
  }
}
