/**
 * Ventana deslizante de peticiones por minuto de un despliegue.
 *
 * Es memoria de proceso, a propósito: la pasarela no depende de Redis ni de
 * ningún otro servicio (Hostinger solo ejecuta la aplicación Node). Si hubiera
 * varias instancias, cada una limitaría por su cuenta y el 429 real del
 * proveedor seguiría siendo la red de seguridad.
 */
export class RateWindow {
  readonly #stamps: number[] = [];

  constructor(
    private readonly limit: number | undefined,
    private readonly windowMs = 60_000
  ) {}

  /** ¿Cabe otra petición ahora? Sin límite siempre cabe. */
  hasCapacity(now: number): boolean {
    if (this.limit === undefined) return true;
    this.#evict(now);
    return this.#stamps.length < this.limit;
  }

  /** Anota una petición. */
  record(now: number): void {
    if (this.limit === undefined) return;
    this.#evict(now);
    this.#stamps.push(now);
  }

  /** Peticiones anotadas en la ventana actual. */
  used(now: number): number {
    this.#evict(now);
    return this.#stamps.length;
  }

  #evict(now: number): void {
    const cutoff = now - this.windowMs;
    let index = 0;
    while (index < this.#stamps.length && this.#stamps[index]! <= cutoff) {
      index += 1;
    }
    if (index > 0) this.#stamps.splice(0, index);
  }
}
