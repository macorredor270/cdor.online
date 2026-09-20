import { redirect } from "@sveltejs/kit";
import { isWebSearchEnabled } from "$lib/server/config";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.principal) {
    redirect(303, "/");
  }
  return {
    webSearchEnabled: isWebSearchEnabled(),
    user: {
      id: locals.principal.user?.id ?? locals.principal.userId,
      name: locals.principal.user?.name ?? "",
      email: locals.principal.user?.email ?? "",
      image: locals.principal.user?.image ?? null
    }
  };
};
