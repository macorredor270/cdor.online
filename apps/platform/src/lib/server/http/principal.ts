import type { Principal } from "../auth/principal";
import { AppError } from "../errors/app-error";

export function requirePrincipal(
  principal: Principal | null | undefined
): Principal {
  if (!principal) {
    throw new AppError(
      "UNAUTHENTICATED",
      "Se necesita una sesión autenticada"
    );
  }
  return principal;
}
