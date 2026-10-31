import { describe, expect, it, vi } from "vitest";
import { testPrincipal } from "../../src/lib/server/auth/principal";
import { AccountService } from "../../src/lib/server/services/account";

const USER_ID = "01J90000000000000000000000";

function repositoryDouble(deleted = true) {
  return { deleteUser: vi.fn().mockResolvedValue(deleted) };
}

describe("eliminación de cuenta", () => {
  it("elimina la cuenta tras verificar la contraseña", async () => {
    const repository = repositoryDouble();
    const verify = vi.fn().mockResolvedValue(true);
    const service = new AccountService(repository as never, verify);

    const result = await service.delete(
      testPrincipal(USER_ID),
      { password: "contraseña-correcta" },
      new Headers()
    );

    expect(result.deleted).toBe(true);
    expect(repository.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("no elimina nada si la contraseña no es correcta", async () => {
    const repository = repositoryDouble();
    const service = new AccountService(
      repository as never,
      vi.fn().mockResolvedValue(false)
    );

    await expect(
      service.delete(
        testPrincipal(USER_ID),
        { password: "incorrecta" },
        new Headers()
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.deleteUser).not.toHaveBeenCalled();
  });

  it("no elimina nada si la verificación falla por error del proveedor", async () => {
    const repository = repositoryDouble();
    const service = new AccountService(
      repository as never,
      vi.fn().mockRejectedValue(new Error("caído"))
    );

    await expect(
      service.delete(
        testPrincipal(USER_ID),
        { password: "cualquiera" },
        new Headers()
      )
    ).rejects.toThrow();
    expect(repository.deleteUser).not.toHaveBeenCalled();
  });

  it("rechaza un cuerpo con campos desconocidos", async () => {
    const repository = repositoryDouble();
    const service = new AccountService(
      repository as never,
      vi.fn().mockResolvedValue(true)
    );

    await expect(
      service.delete(
        testPrincipal(USER_ID),
        { password: "correcta", userId: "01J90000000000000000000001" } as never,
        new Headers()
      )
    ).rejects.toThrow();
    expect(repository.deleteUser).not.toHaveBeenCalled();
  });

  it("informa si la cuenta ya no existe", async () => {
    const service = new AccountService(
      repositoryDouble(false) as never,
      vi.fn().mockResolvedValue(true)
    );

    await expect(
      service.delete(
        testPrincipal(USER_ID),
        { password: "correcta" },
        new Headers()
      )
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("nunca devuelve la contraseña en la respuesta", async () => {
    const service = new AccountService(
      repositoryDouble() as never,
      vi.fn().mockResolvedValue(true)
    );

    const result = await service.delete(
      testPrincipal(USER_ID),
      { password: "secreto-irrepetible" },
      new Headers()
    );

    expect(JSON.stringify(result)).not.toContain("secreto-irrepetible");
  });
});
