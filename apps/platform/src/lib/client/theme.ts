/**
 * Preferencia de tema del navegador.
 *
 * El tema se aplica antes del primer pintado con el script en línea de
 * `app.html`; este módulo solo lee y cambia la preferencia después. Ambos
 * deben usar la misma clave y los mismos valores.
 */

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "cdor-theme";
const SYSTEM_QUERY = "(prefers-color-scheme: light)";

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Sin almacenamiento (modo privado estricto) se usa el tema por defecto.
  }
  return "dark";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(SYSTEM_QUERY).matches ? "light" : "dark";
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(preference);
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // La preferencia sigue aplicada en esta página aunque no se persista.
  }
  applyTheme(preference);
}

/**
 * Sigue los cambios del sistema mientras la preferencia sea «Sistema».
 * Devuelve la función que deja de escuchar.
 */
export function followSystemTheme(): () => void {
  const query = window.matchMedia(SYSTEM_QUERY);
  const onChange = () => {
    if (readThemePreference() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
