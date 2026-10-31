/**
 * Escapa texto antes de insertarlo en una plantilla HTML de correo.
 *
 * Los clientes de correo renderizan HTML: cualquier campo que venga del
 * exterior y se interpole sin escapar permite inyectar marcado en la bandeja
 * de quien lo recibe. Escapar la comilla simple y la doble importa además
 * porque hay campos que acaban dentro de un atributo (`href="mailto:…"`), no
 * solo en el cuerpo del documento.
 */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character] ?? character
  );
}
