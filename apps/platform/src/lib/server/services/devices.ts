import {
  DeviceSchema,
  LinkDeviceRequestSchema,
  UlidSchema,
  type Device,
  type LinkDeviceRequest
} from "@cdor/contracts";
import { ulid } from "ulid";
import type { Principal } from "../auth/principal";
import {
  DeviceRepository,
  type DeviceRow
} from "../db/repositories/devices";
import { AppError } from "../errors/app-error";

function serializeDevice(row: DeviceRow): Device {
  return DeviceSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null
  });
}

export class DeviceService {
  constructor(
    private readonly repository: DeviceRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = ulid
  ) {}

  async link(
    principal: Principal,
    rawInput: LinkDeviceRequest
  ): Promise<Device> {
    if (!principal.sessionId) {
      throw new AppError("UNAUTHENTICATED", "La sesión no es revocable");
    }
    const input = LinkDeviceRequestSchema.parse(rawInput);
    const row = await this.repository.linkCurrentSession({
      id: input.id ?? this.createId(),
      userId: principal.userId,
      sessionId: principal.sessionId,
      name: input.name,
      platform: input.platform,
      appVersion: input.appVersion,
      now: this.now()
    });
    if (!row) {
      throw new AppError("UNAUTHENTICATED", "La sesión ya no existe");
    }
    return serializeDevice(row);
  }

  async list(principal: Principal): Promise<Device[]> {
    return (await this.repository.listOwned(principal.userId)).map(
      serializeDevice
    );
  }

  async revoke(principal: Principal, rawDeviceId: string): Promise<void> {
    const deviceId = UlidSchema.parse(rawDeviceId);
    if (
      !(await this.repository.revokeOwned(
        principal.userId,
        deviceId,
        this.now()
      ))
    ) {
      throw new AppError("RESOURCE_NOT_FOUND", "El dispositivo no existe");
    }
  }
}
