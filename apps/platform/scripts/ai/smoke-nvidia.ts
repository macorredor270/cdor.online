import { resolveConfiguredModel } from "../../src/lib/server/ai/model-router";
import { createNvidiaProvider } from "../../src/lib/server/ai/runtime";
import { collectGeneration } from "./collect";
import { loadAiEnvironment } from "./environment";

const environment = loadAiEnvironment();
if (!environment.NVIDIA_DEFAULT_MODEL) {
  throw new Error(
    "NVIDIA_DEFAULT_MODEL debe contener el ganador exacto del benchmark"
  );
}

const provider = createNvidiaProvider(environment);
const model = await resolveConfiguredModel(
  provider,
  environment.NVIDIA_DEFAULT_MODEL
);
const generation = await collectGeneration(provider, {
  model: model.id,
  messages: [
    {
      role: "user",
      content: "Responde únicamente con: CDOR_NVIDIA_OK"
    }
  ],
  maxOutputTokens: 64,
  temperature: 0
});

if (generation.text.trim() !== "CDOR_NVIDIA_OK") {
  throw new Error("El smoke de NVIDIA no respetó la salida esperada");
}

process.stdout.write(
  `NVIDIA verificado: modelo=${model.id} latencia_total_ms=${generation.latencyTotalMs} tokens_entrada=${generation.inputTokens} tokens_salida=${generation.outputTokens}\n`
);
