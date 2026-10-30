/**
 * Elige el modelo de un proveedor entre los que publica.
 *
 * Los identificadores de modelo caducan rápido (los proveedores retiran y
 * renombran modelos gratuitos con frecuencia), así que en lugar de fijar uno
 * por proveedor se descubre el disponible: se prueba cada patrón de
 * preferencia, en orden, y dentro del primero que coincida se elige la versión
 * más reciente. Devuelve `null` si ninguno coincide.
 */
export function pickModel(
  available: readonly string[],
  prefer: readonly RegExp[]
): string | null {
  for (const pattern of prefer) {
    const matches = available.filter((id) => pattern.test(id));
    if (matches.length > 0) {
      return [...matches].sort(compareNatural).at(-1) ?? null;
    }
  }
  return null;
}

/** Orden «natural»: \`gemini-2.5-flash\` < \`gemini-10-flash\`. */
function compareNatural(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true });
}

/** Algunos catálogos devuelven `models/<id>`; las peticiones usan `<id>`. */
export function stripModelsPrefix(id: string): string {
  return id.startsWith("models/") ? id.slice("models/".length) : id;
}
