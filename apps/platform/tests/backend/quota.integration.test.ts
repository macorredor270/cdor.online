import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../../src/lib/server/db/client";
import { QuotaRepository } from "../../src/lib/server/db/repositories/quota";
import { rateLimitBuckets } from "../../src/lib/server/db/schema";
import { AppError } from "../../src/lib/server/errors/app-error";
import {
  QuotaService,
  windowStartFor,
  type QuotaLimits
} from "../../src/lib/server/services/quota";
import {
  applyMigrations,
  createTestDatabase,
  databaseUrlFor,
  dropTestDatabase,
  testDatabaseName
} from "../db/helpers";

const databaseName = testDatabaseName("quota");
const USER_A = "01J20000000000000000000000";
const USER_B = "01J20000000000000000000001";
const DAY_ONE = new Date("2026-07-29T12:00:00.000Z");
const DAY_TWO = new Date("2026-07-30T00:00:01.000Z");
// El contador global es compartido: este día solo lo usa el test del tope.
const GLOBAL_DAY = new Date("2026-08-15T12:00:00.000Z");

let client: ReturnType<typeof createDatabaseClient>;
let repository: QuotaRepository;

function service(limits: Partial<QuotaLimits>, clock: () => Date = () => DAY_ONE) {
  return new QuotaService(
    repository,
    {
      userMessagesPerDay: 0,
      userTokensPerDay: 0,
      globalTokensPerDay: 0,
      ...limits
    },
    clock
  );
}

async function expectRateLimited(promise: Promise<unknown>, quota: string) {
  const error = await promise.then(
    () => null,
    (cause: unknown) => cause
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe("RATE_LIMITED");
  expect((error as AppError).status).toBe(429);
  expect((error as AppError).details).toEqual({ quota });
}

describe.sequential("cuotas diarias con MySQL", () => {
  beforeAll(async () => {
    await createTestDatabase(databaseName);
    await applyMigrations(databaseUrlFor(databaseName));
    client = createDatabaseClient(databaseUrlFor(databaseName), {
      connectionLimit: 8
    });
    repository = new QuotaRepository(client.database);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await dropTestDatabase(databaseName);
  }, 120_000);

  it("la ventana es el día UTC", () => {
    expect(windowStartFor(DAY_ONE).toISOString()).toBe("2026-07-29T00:00:00.000Z");
    expect(windowStartFor(DAY_TWO).toISOString()).toBe("2026-07-30T00:00:00.000Z");
  });

  it("cuenta mensajes hasta el límite y rechaza el siguiente", async () => {
    const quota = service({ userMessagesPerDay: 3 });
    for (let index = 0; index < 3; index += 1) {
      await quota.reserveMessage(USER_A);
    }
    await expectRateLimited(quota.reserveMessage(USER_A), "messages");
    expect((await quota.snapshot(USER_A)).messages).toEqual({ used: 3, limit: 3 });
  });

  it("el límite es por usuario: otro usuario conserva su cuota", async () => {
    const quota = service({ userMessagesPerDay: 3 });
    await quota.reserveMessage(USER_B);
    expect((await quota.snapshot(USER_B)).messages.used).toBe(1);
  });

  it("peticiones simultáneas nunca superan el límite", async () => {
    const quota = service({ userMessagesPerDay: 5 });
    const user = "01J20000000000000000000009";
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => quota.reserveMessage(user))
    );
    const accepted = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(accepted).toHaveLength(5);
    expect(rejected).toHaveLength(25);
    expect((await quota.snapshot(user)).messages.used).toBe(5);
  });

  it("devolver un mensaje libera su hueco y no baja de cero", async () => {
    const quota = service({ userMessagesPerDay: 2 });
    const user = "01J20000000000000000000010";
    const first = await quota.reserveMessage(user);
    await quota.reserveMessage(user);
    await expectRateLimited(quota.reserveMessage(user), "messages");

    await quota.refundMessage(first);
    await quota.reserveMessage(user);
    expect((await quota.snapshot(user)).messages.used).toBe(2);

    const other = "01J20000000000000000000011";
    await quota.refundMessageAt(other, DAY_ONE);
    await quota.refundMessageAt(other, DAY_ONE);
    expect((await quota.snapshot(other)).messages.used).toBe(0);
  });

  it("el reembolso va a la ventana del día original", async () => {
    const user = "01J20000000000000000000012";
    const day1 = service({ userMessagesPerDay: 5 });
    await day1.reserveMessage(user);
    // Ya es el día siguiente cuando falla la generación iniciada ayer.
    const day2 = service({ userMessagesPerDay: 5 }, () => DAY_TWO);
    await day2.refundMessageAt(user, DAY_ONE);
    expect((await day1.snapshot(user)).messages.used).toBe(0);
    expect((await day2.snapshot(user)).messages.used).toBe(0);
  });

  it("la cuota se restablece al empezar el día siguiente", async () => {
    const user = "01J20000000000000000000013";
    const today = service({ userMessagesPerDay: 1 });
    await today.reserveMessage(user);
    await expectRateLimited(today.reserveMessage(user), "messages");

    const tomorrow = service({ userMessagesPerDay: 1 }, () => DAY_TWO);
    await tomorrow.reserveMessage(user);
    expect((await tomorrow.snapshot(user)).resetsAt).toBe("2026-07-31T00:00:00.000Z");
  });

  it("los tokens se acumulan al terminar y bloquean la siguiente petición", async () => {
    const user = "01J20000000000000000000014";
    const quota = service({ userTokensPerDay: 1_000 });
    await quota.reserveMessage(user);
    await quota.recordTokens(user, 600);
    await quota.reserveMessage(user);
    await quota.recordTokens(user, 450);
    // Rebasar al terminar es posible; lo que se impide es empezar otra.
    expect((await quota.snapshot(user)).tokens).toEqual({ used: 1_050, limit: 1_000 });
    await expectRateLimited(quota.reserveMessage(user), "tokens");
  });

  it("el tope global bloquea a todos los usuarios", async () => {
    const quota = service({ globalTokensPerDay: 500 }, () => GLOBAL_DAY);
    const first = "01J20000000000000000000015";
    const second = "01J20000000000000000000016";
    await quota.reserveMessage(first);
    await quota.recordTokens(first, 500);
    await expectRateLimited(quota.reserveMessage(second), "global");
  });

  it("con los límites a 0 no se aplica ninguno", async () => {
    const quota = service({});
    const user = "01J20000000000000000000017";
    for (let index = 0; index < 20; index += 1) {
      const reservation = await quota.reserveMessage(user);
      expect(reservation.counted).toBe(false);
    }
    await quota.recordTokens(user, 10_000_000);
    expect((await quota.snapshot(user)).messages).toEqual({ used: 0, limit: null });
  });

  it("ignora cantidades no válidas", async () => {
    const quota = service({ userTokensPerDay: 100 });
    const user = "01J20000000000000000000018";
    await quota.recordTokens(user, 0);
    await quota.recordTokens(user, -5);
    await quota.recordTokens(user, Number.NaN);
    expect((await quota.snapshot(user)).tokens.used).toBe(0);
  });

  it("los contadores no guardan el identificador del usuario", async () => {
    const rows = await client.database.select().from(rateLimitBuckets);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.subjectHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain("01J2000");
    }
  });

  it("purga solo los contadores caducados", async () => {
    const repo = new QuotaRepository(client.database);
    const future = new Date(DAY_ONE.getTime() + 30 * 24 * 60 * 60 * 1000);
    const before = (await client.database.select().from(rateLimitBuckets)).length;
    expect(await repo.purgeExpired(DAY_ONE)).toBe(0);
    const removed = await repo.purgeExpired(future);
    expect(removed).toBe(before);
    expect(await client.database.select().from(rateLimitBuckets)).toHaveLength(0);
  });
});
