import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { devices, session } from "../schema";

export type DeviceRow = typeof devices.$inferSelect;

export class DeviceRepository {
  constructor(private readonly database: Database) {}

  async linkCurrentSession(input: {
    id: string;
    userId: string;
    sessionId: string;
    name: string;
    platform: "web" | "android" | "ios" | "desktop";
    appVersion: string;
    now: Date;
  }): Promise<DeviceRow | null> {
    return this.database.transaction(async (transaction) => {
      const [currentSession] = await transaction
        .select({ id: session.id, deviceId: session.deviceId })
        .from(session)
        .where(
          and(
            eq(session.id, input.sessionId),
            eq(session.userId, input.userId)
          )
        )
        .limit(1)
        .for("update");
      if (!currentSession) {
        return null;
      }

      if (currentSession.deviceId) {
        const [existingDevice] = await transaction
          .select()
          .from(devices)
          .where(
            and(
              eq(devices.id, currentSession.deviceId),
              eq(devices.userId, input.userId),
              isNull(devices.revokedAt)
            )
          )
          .limit(1)
          .for("update");

        if (existingDevice) {
          await transaction
            .update(devices)
            .set({
              name: input.name,
              platform: input.platform,
              appVersion: input.appVersion,
              lastSeenAt: input.now
            })
            .where(eq(devices.id, existingDevice.id));

          return {
            ...existingDevice,
            name: input.name,
            platform: input.platform,
            appVersion: input.appVersion,
            lastSeenAt: input.now
          };
        }
      }

      await transaction.insert(devices).values({
        id: input.id,
        userId: input.userId,
        name: input.name,
        platform: input.platform,
        appVersion: input.appVersion,
        lastSeenAt: input.now,
        createdAt: input.now
      });
      await transaction
        .update(session)
        .set({ deviceId: input.id })
        .where(
          and(
            eq(session.id, input.sessionId),
            eq(session.userId, input.userId)
          )
        );

      return {
        id: input.id,
        userId: input.userId,
        name: input.name,
        platform: input.platform,
        appVersion: input.appVersion,
        lastSeenAt: input.now,
        createdAt: input.now,
        revokedAt: null
      };
    });
  }

  async listOwned(userId: string): Promise<DeviceRow[]> {
    return this.database
      .select()
      .from(devices)
      .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))
      .orderBy(desc(devices.lastSeenAt), desc(devices.id));
  }

  async revokeOwned(
    userId: string,
    deviceId: string,
    now: Date
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const [device] = await transaction
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(
            eq(devices.id, deviceId),
            eq(devices.userId, userId),
            isNull(devices.revokedAt)
          )
        )
        .limit(1)
        .for("update");
      if (!device) {
        return false;
      }

      await transaction
        .update(devices)
        .set({ revokedAt: now })
        .where(
          and(eq(devices.id, deviceId), eq(devices.userId, userId))
        );
      await transaction
        .delete(session)
        .where(
          and(eq(session.userId, userId), eq(session.deviceId, deviceId))
        );
      return true;
    });
  }
}
