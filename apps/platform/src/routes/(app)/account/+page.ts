import type { Device } from "@cdor/contracts";
import { apiRequest } from "$lib/client/api";
import type { PageLoad } from "./$types";

/**
 * La identidad se espera —es lo primero que se ve— pero la lista de
 * dispositivos se transmite: la cabecera con tu nombre y la zona de borrado
 * aparecen sin depender de una llamada que puede tardar.
 */
export const load: PageLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  return {
    user,
    devices: apiRequest<Device[]>(fetch, "/api/v1/auth/devices")
  };
};
