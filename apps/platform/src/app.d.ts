import type { Principal } from "$lib/server/auth/principal";

declare global {
  namespace App {
    interface Locals {
      principal: Principal | null;
      requestId: string;
    }
  }
}

export {};
