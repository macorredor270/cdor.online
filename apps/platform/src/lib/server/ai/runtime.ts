import type {
  AiEnvironment,
  OpenRouterEnvironment
} from "../config/schema";
import { NvidiaNimProvider } from "./nvidia-nim";
import { OpenRouterProvider } from "./openrouter";

export function createNvidiaProvider(environment: AiEnvironment) {
  return new NvidiaNimProvider({
    apiKey: environment.NVIDIA_API_KEY,
    baseUrl: environment.NVIDIA_BASE_URL,
    requestTimeoutMs: environment.NVIDIA_REQUEST_TIMEOUT_MS
  });
}

export function createOpenRouterProvider(
  environment: OpenRouterEnvironment,
  modelAliases?: Readonly<Record<string, string>>
) {
  return new OpenRouterProvider({
    apiKey: environment.OPENROUTER_API_KEY,
    baseUrl: environment.OPENROUTER_BASE_URL,
    requestTimeoutMs: environment.OPENROUTER_REQUEST_TIMEOUT_MS,
    modelAliases
  });
}
