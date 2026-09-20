// El prompt lleva andamiaje propio de CDOR: cada memoria viaja como mensaje
// `system` con el prefijo `[Memoria:categoría]` y el resumen con el suyo.
// Un modelo pequeño copia ese patrón y lo devuelve como si fuese respuesta;
// con la búsqueda web activa también verbaliza el nombre de la herramienta en
// vez de emitir una llamada estructurada. Nada de eso debe cruzar la frontera
// hacia el usuario ni quedar persistido en el mensaje.

const SCAFFOLDING_PATTERNS: readonly RegExp[] = Object.freeze([
  /\[Memoria:[^\]\n]{0,64}\]\s?/g,
  /\[Resumen de contexto anterior\]\s?/g,
  /\b[\w.-]{0,32}\s*:\s*search_openrouter\b\s?/gi,
  /\bopenrouter\s*:\s*web_search\b\s?/gi
]);

// Un marcador puede llegar partido entre dos deltas, así que la cola que
// todavía podría completarlo se retiene. El tope evita que un corchete suelto
// o una URL bloqueen el stream indefinidamente.
const MAX_PENDING_CHARACTERS = 64;

function suspiciousTailIndex(value: string): number {
  const openBracket = value.lastIndexOf("[");
  if (openBracket !== -1 && !value.includes("]", openBracket)) {
    return openBracket;
  }

  const lastBreak = Math.max(
    value.lastIndexOf(" "),
    value.lastIndexOf("\n"),
    value.lastIndexOf("\t")
  );
  const tail = value.slice(lastBreak + 1);
  if (tail.length > 0 && tail.includes(":")) {
    return lastBreak + 1;
  }
  return -1;
}

function strip(value: string): string {
  let result = value;
  for (const pattern of SCAFFOLDING_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result;
}

export type ScaffoldingFilter = Readonly<{
  push: (text: string) => string;
  flush: () => string;
}>;

export function createScaffoldingFilter(): ScaffoldingFilter {
  let pending = "";
  let emittedAny = false;

  function emit(value: string): string {
    const text = emittedAny ? value : value.trimStart();
    if (text.length > 0) {
      emittedAny = true;
    }
    return text;
  }

  return Object.freeze({
    push(text: string): string {
      const cleaned = strip(pending + text);
      const tail = suspiciousTailIndex(cleaned);

      if (tail === -1 || cleaned.length - tail > MAX_PENDING_CHARACTERS) {
        pending = "";
        return emit(cleaned);
      }

      pending = cleaned.slice(tail);
      return emit(cleaned.slice(0, tail));
    },
    flush(): string {
      const remaining = strip(pending);
      pending = "";
      return emit(remaining);
    }
  });
}
