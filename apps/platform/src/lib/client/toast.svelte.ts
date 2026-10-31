/**
 * Store de toasts.
 *
 * Existe porque los errores eran `<p class="error">` inline: cuando la acción
 * ocurría lejos del scroll —revocar un dispositivo, copiar un bloque de código
 * al final de una conversación larga— no había respuesta visible.
 *
 * Sin dependencias externas. Runas de Svelte 5.
 */

export type ToastKind = "success" | "error" | "info" | "warning";

export type Toast = Readonly<{
  id: number;
  kind: ToastKind;
  message: string;
  /** Los errores permanecen hasta que se cierran; el resto se van solos. */
  duration: number;
}>;

const DEFAULT_DURATION = 4000;
const MAX_VISIBLE = 4;

let nextId = 0;

class ToastStore {
  items = $state<Toast[]>([]);
  /** Temporizadores vivos, para poder pausarlos al recibir hover o foco. */
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();

  push(kind: ToastKind, message: string, duration = DEFAULT_DURATION): number {
    const text = message.trim();
    if (!text) return -1;

    // Deduplicación: repetir la misma acción no debe apilar avisos idénticos.
    const duplicate = this.items.find(
      (item) => item.kind === kind && item.message === text
    );
    if (duplicate) {
      this.#arm(duplicate.id, duration);
      return duplicate.id;
    }

    const id = ++nextId;
    // Un error no se autocierra: puede ser la única explicación del fallo.
    const life = kind === "error" ? 0 : duration;
    this.items = [...this.items, { id, kind, message: text, duration: life }]
      .slice(-MAX_VISIBLE);
    this.#arm(id, life);
    return id;
  }

  success(message: string) {
    return this.push("success", message);
  }

  error(message: string) {
    return this.push("error", message);
  }

  info(message: string) {
    return this.push("info", message);
  }

  warning(message: string) {
    return this.push("warning", message);
  }

  dismiss(id: number) {
    this.#clear(id);
    this.items = this.items.filter((item) => item.id !== id);
  }

  /** Al pasar el puntero o el foco, el aviso deja de correr. */
  pause() {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }

  resume() {
    for (const item of this.items) this.#arm(item.id, item.duration);
  }

  #arm(id: number, duration: number) {
    this.#clear(id);
    if (duration <= 0) return;
    this.#timers.set(
      id,
      setTimeout(() => this.dismiss(id), duration)
    );
  }

  #clear(id: number) {
    const timer = this.#timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#timers.delete(id);
    }
  }
}

export const toasts = new ToastStore();
