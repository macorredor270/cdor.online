import { getAuth } from "../auth/runtime";
import { getDatabaseClient } from "../db/client";
import { AccountRepository } from "../db/repositories/account";
import { ConversationRepository } from "../db/repositories/conversations";
import { DeviceRepository } from "../db/repositories/devices";
import { MemoryRepository } from "../db/repositories/memories";
import { MessageRepository } from "../db/repositories/messages";
import { MobileOAuthRepository } from "../db/repositories/mobile-oauth";
import { SyncRepository } from "../db/repositories/sync";
import { UsageRepository } from "../db/repositories/usage";
import { AccountService } from "./account";
import { ConversationService } from "./conversations";
import { DeviceService } from "./devices";
import { MemoryService } from "./memories";
import { MessageService } from "./messages";
import { MobileOAuthService } from "./mobile-oauth";
import { SyncService } from "./sync";
import { UsageService } from "./usage";

let services:
  | Readonly<{
      account: AccountService;
      conversations: ConversationService;
      devices: DeviceService;
      memories: MemoryService;
      messages: MessageService;
      mobileOAuth: MobileOAuthService;
      sync: SyncService;
      usage: UsageService;
    }>
  | undefined;

export function getServices() {
  if (!services) {
    const database = getDatabaseClient().database;
    services = Object.freeze({
      account: new AccountService(
        new AccountRepository(database),
        async (password, headers) => {
          const result = await getAuth()
            .api.verifyPassword({ body: { password }, headers })
            .catch(() => null);
          return result?.status === true;
        }
      ),
      conversations: new ConversationService(
        new ConversationRepository(database)
      ),
      devices: new DeviceService(new DeviceRepository(database)),
      memories: new MemoryService(new MemoryRepository(database)),
      messages: new MessageService(new MessageRepository(database)),
      mobileOAuth: new MobileOAuthService(new MobileOAuthRepository(database)),
      sync: new SyncService(new SyncRepository(database)),
      usage: new UsageService(new UsageRepository(database))
    });
  }
  return services;
}
