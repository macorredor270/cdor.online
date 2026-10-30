import type { Principal } from "#lib/server/auth/principal.js";

declare global {
  namespace App {
    interface Locals {
      principal: Principal | null;
      requestId: string;
    }
  }
}

export {};
