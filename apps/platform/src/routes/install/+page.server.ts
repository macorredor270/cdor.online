import { stat } from "node:fs/promises";
import path from "node:path";
import type { PageServerLoad } from "./$types";

/**
 * Metadatos del APK publicado.
 *
 * Se leen del archivo real en cada petición para que publicar una versión
 * nueva sea solo sustituir `static/downloads/mac-android.apk`, sin tocar
 * código ni arriesgarse a anunciar un tamaño o una fecha que ya no son.
 */
const APK_PATHS = [
  "static/downloads/mac-android.apk",
  "build/client/downloads/mac-android.apk",
  "runtime/build/client/downloads/mac-android.apk",
  "apps/platform/static/downloads/mac-android.apk",
  "apps/platform/build/client/downloads/mac-android.apk"
];

function formatSize(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(1)} MB`;
}

export const load: PageServerLoad = async () => {
  for (const candidate of APK_PATHS) {
    try {
      const file = await stat(path.resolve(process.cwd(), candidate));
      return {
        apk: {
          available: true as const,
          size: formatSize(file.size),
          updated: file.mtime.toISOString(),
          href: `/downloads/mac-android.apk?v=${file.size}-${Math.trunc(file.mtimeMs)}`
        }
      };
    } catch {
      // El runtime puede arrancar desde la raíz publicada o desde `runtime/`.
    }
  }

  // Sin APK subido todavía: la página lo dice en vez de ofrecer un enlace roto.
  return { apk: { available: false as const, size: "", updated: "", href: "" } };
};
