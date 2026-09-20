const encoder = new TextEncoder();

export type DeltaBatcherConfiguration = Readonly<{
  maximumBytes: number;
  windowMs: number;
  flush: (text: string) => void;
}>;

export class DeltaBatcher {
  readonly #maximumBytes: number;
  readonly #windowMs: number;
  readonly #onFlush: (text: string) => void;
  #buffer = "";
  #bufferBytes = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(configuration: DeltaBatcherConfiguration) {
    this.#maximumBytes = configuration.maximumBytes;
    this.#windowMs = configuration.windowMs;
    this.#onFlush = configuration.flush;
  }

  write(text: string): void {
    if (text === "") {
      return;
    }
    this.#buffer += text;
    this.#bufferBytes += encoder.encode(text).byteLength;

    if (this.#bufferBytes >= this.#maximumBytes) {
      this.flush();
    } else {
      this.#timer ??= setTimeout(() => this.flush(), this.#windowMs);
    }
  }

  flush(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    if (this.#buffer === "") {
      return;
    }
    const text = this.#buffer;
    this.#buffer = "";
    this.#bufferBytes = 0;
    this.#onFlush(text);
  }

  close(): void {
    this.flush();
  }
}
