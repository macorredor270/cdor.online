import { redirect } from "@sveltejs/kit";
import {
  getSocialAuthAvailability,
  isSignUpEnabled
} from "#lib/server/config/index.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  if (locals.principal) {
    redirect(303, "/chat");
  }

  // El acceso decía "reservado a las cuentas invitadas" justo encima de un
  // enlace para crear una cuenta, y el alta estaba abierta. La página no puede
  // inventarse ese dato: lo lee de la misma configuración que aplica el
  // servidor de autenticación.
  return {
    signUpEnabled: isSignUpEnabled(),
    socialProviders: getSocialAuthAvailability()
  };
};
