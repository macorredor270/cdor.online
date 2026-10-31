/**
 * Comprueba cada proveedor configurado en la pasarela: descubre su modelo, pide
 * una respuesta mínima y mide la latencia. Sale con código distinto de cero si
 * ninguno responde.
 *
 * Sale a la red real, así que solo se ejecuta a mano o en CI protegido:
 *   pnpm smoke:providers
 *
 * No imprime claves ni contenido: solo el identificador del proveedor, el
 * modelo elegido y el resultado.
 */
import { AppError } from "../../src/lib/server/errors/app-error";
import { buildDeployments } from "../../src/lib/server/ai/gateway";
import { loadGatewayEnvironment } from "./environment";

const TIMEOUT_MS = 30_000;

const deployments = buildDeployments(loadGatewayEnvironment(), {
  warn: (message) => console.warn(`AVISO ${message}`)
});

if (deployments.length === 0) {
  console.error(
    "No hay ningún proveedor configurado. Define al menos una clave (por ejemplo GROQ_API_KEY) o AI_CUSTOM_PROVIDERS."
  );
  process.exit(1);
}

let healthy = 0;
console.log(`Comprobando ${deployments.length} proveedor(es):\n`);

for (const deployment of deployments) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const started = performance.now();
  let model = "(sin resolver)";
  try {
    const source = deployment.entry.model;
    model =
      source === undefined
        ? "(por defecto)"
        : typeof source === "string"
          ? source
          : await source.resolve(signal);

    let text = "";
    for await (const chunk of deployment.provider.streamChat(
      {
        model,
        messages: [{ role: "user", content: "Responde solo con la palabra: ok" }],
        maxOutputTokens: 16,
        temperature: 0
      },
      signal
    )) {
      if (chunk.type === "delta") text += chunk.text;
    }
    const elapsed = Math.round(performance.now() - started);
    if (text.trim().length === 0) throw new Error("respuesta vacía");
    healthy += 1;
    console.log(
      `  ✔ ${deployment.id.padEnd(12)} ${model.padEnd(40)} ${String(elapsed).padStart(6)} ms`
    );
  } catch (error) {
    const reason =
      error instanceof AppError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "error desconocido";
    console.log(`  ✘ ${deployment.id.padEnd(12)} ${model.padEnd(40)} ${reason}`);
  }
}

console.log(`\n${healthy} de ${deployments.length} responden.`);
process.exit(healthy > 0 ? 0 : 1);
