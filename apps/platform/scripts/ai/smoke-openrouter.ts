import { createOpenRouterProvider } from "../../src/lib/server/ai/runtime";
import { collectGeneration } from "./collect";
import { loadOpenRouterEnvironment } from "./openrouter-environment";

const MAXIMUM_MODELS_TO_TEST = 3;
const environment = loadOpenRouterEnvironment();
const provider = createOpenRouterProvider(environment);
const available = (await provider.listModels())
  .filter(({ id }) => id !== "openrouter/free")
  .sort((left, right) => left.id.localeCompare(right.id))
  .slice(0, MAXIMUM_MODELS_TO_TEST);

if (available.length === 0) {
  throw new Error("OpenRouter no devolvió modelos gratuitos específicos");
}

let successful = 0;
for (const model of available) {
  try {
    const generation = await collectGeneration(provider, {
      model: model.id,
      messages: [
        {
          role: "user",
          content: "Responde brevemente confirmando que puedes responder."
        }
      ],
      maxOutputTokens: 64,
      temperature: 0
    });
    successful += 1;
    process.stdout.write(
      `OpenRouter OK: modelo=${model.id} latencia_total_ms=${generation.latencyTotalMs} tokens_salida=${generation.outputTokens}\n`
    );
  } catch {
    process.stdout.write(`OpenRouter FAIL: modelo=${model.id}\n`);
  }
}

if (successful === 0) {
  throw new Error("Ningún modelo gratuito de OpenRouter respondió");
}

process.stdout.write(
  `OpenRouter verificado: ${successful}/${available.length} modelos gratuitos respondieron\n`
);
