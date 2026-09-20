type RequestLog = Readonly<{
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}>;

export function logRequest(entry: RequestLog): void {
  // Nunca registra query strings, cookies, authorization, payloads ni contenido
  // de conversaciones. El formato JSON permite ingerirlo directamente en logs.
  console.info(`CDOR_ACCESS ${JSON.stringify(entry)}`);
}
