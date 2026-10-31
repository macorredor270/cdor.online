const activeGenerations = new Map<string, AbortController>();

export function registerGeneration(
  generationId: string,
  controller: AbortController
): void {
  activeGenerations.set(generationId, controller);
}

export function unregisterGeneration(
  generationId: string,
  controller: AbortController
): void {
  if (activeGenerations.get(generationId) === controller) {
    activeGenerations.delete(generationId);
  }
}

export function abortLocalGeneration(generationId: string): boolean {
  const controller = activeGenerations.get(generationId);
  controller?.abort();
  return controller !== undefined;
}
