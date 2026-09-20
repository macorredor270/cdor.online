import { getSocialAuthAvailability, isSignUpEnabled } from "$lib/server/config";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
  if (!isSignUpEnabled()) redirect(303, "/");
  return { socialProviders: getSocialAuthAvailability() };
};
