import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SENSITIVE_SERVER_NAMES = Object.freeze([
  "DB_HOST",
  "DB_PORT",
  "DB_POOL_LIMIT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DATABASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_CONNECTION_TIMEOUT_MS",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "AUTH_SIGN_UP_ENABLED",
  "NVIDIA_API_KEY",
  "NVIDIA_BASE_URL",
  "NVIDIA_DEFAULT_MODEL",
  "NVIDIA_REQUEST_TIMEOUT_MS",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_DEFAULT_MODEL",
  "OPENROUTER_REQUEST_TIMEOUT_MS",
  "QUOTA_USER_DAILY_MESSAGES",
  "QUOTA_USER_DAILY_TOKENS",
  "QUOTA_GLOBAL_DAILY_TOKENS",
  "AI_FALLBACK_OPENROUTER",
  "NVIDIA_RPM",
  "GROQ_API_KEY",
  "GROQ_DEFAULT_MODEL",
  "GROQ_RPM",
  "GEMINI_API_KEY",
  "GEMINI_DEFAULT_MODEL",
  "GEMINI_RPM",
  "MISTRAL_API_KEY",
  "MISTRAL_DEFAULT_MODEL",
  "MISTRAL_RPM",
  "AI_ROUTING",
  "AI_PROVIDER_ORDER",
  "AI_CUSTOM_PROVIDERS",
  "AI_WEB_SEARCH",
  "STREAM_CANARY_TOKEN"
]);

export const SECRET_CANARIES = Object.freeze({
  DB_HOST: "db-canary-7f42.invalid",
  DB_PORT: "65431",
  DB_NAME: "cdor_canary_db_7f42",
  DB_USER: "cdor_canary_user_7f42",
  DB_PASSWORD: "__CDOR_PRIVATE_CANARY_DB_PASSWORD_7f42c9__",
  DATABASE_URL:
    "mysql://cdor_canary:private_7f42@db-canary-7f42.invalid:65431/cdor_canary",
  SMTP_HOST: "smtp-canary-7f42.invalid",
  SMTP_PORT: "65432",
  SMTP_USER: "smtp-canary-7f42@cdor.invalid",
  SMTP_PASSWORD: "__CDOR_PRIVATE_CANARY_SMTP_PASSWORD_7f42c9__",
  SMTP_FROM: "auth-canary-7f42@cdor.invalid",
  BETTER_AUTH_SECRET: "__CDOR_PRIVATE_CANARY_BETTER_AUTH_7f42c9__",
  BETTER_AUTH_URL: "https://auth-canary-7f42.invalid",
  NVIDIA_API_KEY: "__CDOR_PRIVATE_CANARY_NVIDIA_KEY_7f42c9__",
  NVIDIA_BASE_URL: "https://nvidia-canary-7f42.invalid/v1",
  NVIDIA_DEFAULT_MODEL: "cdor/canary-model-7f42",
  NVIDIA_REQUEST_TIMEOUT_MS: "234567",
  OPENROUTER_API_KEY: "__CDOR_PRIVATE_CANARY_OPENROUTER_KEY_7f42c9__",
  OPENROUTER_BASE_URL: "https://openrouter-canary-7f42.invalid/api/v1",
  OPENROUTER_DEFAULT_MODEL: "cdor/openrouter-canary-free-7f42",
  OPENROUTER_REQUEST_TIMEOUT_MS: "234568",
  // Las variables booleanas o de valores fijos (AI_FALLBACK_OPENROUTER,
  // AI_WEB_SEARCH, AI_ROUTING, AI_PROVIDER_ORDER) se vigilan por su nombre: un
  // valor canario ("false", "ordered"…) aparece en cualquier bundle y daría
  // falsos positivos.
  GROQ_API_KEY: "__CDOR_PRIVATE_CANARY_GROQ_KEY_7f42c9__",
  GROQ_DEFAULT_MODEL: "cdor/groq-canary-model-7f42",
  GROQ_RPM: "7433",
  GEMINI_API_KEY: "__CDOR_PRIVATE_CANARY_GEMINI_KEY_7f42c9__",
  GEMINI_DEFAULT_MODEL: "cdor/gemini-canary-model-7f42",
  GEMINI_RPM: "7434",
  MISTRAL_API_KEY: "__CDOR_PRIVATE_CANARY_MISTRAL_KEY_7f42c9__",
  MISTRAL_DEFAULT_MODEL: "cdor/mistral-canary-model-7f42",
  MISTRAL_RPM: "7435",
  NVIDIA_RPM: "7436",
  AI_CUSTOM_PROVIDERS:
    "[{\"id\":\"canary\",\"baseUrl\":\"https://custom-canary-7f42.invalid/v1\",\"apiKey\":\"__CDOR_PRIVATE_CANARY_CUSTOM_KEY_7f42c9__\",\"model\":\"cdor/custom-canary-7f42\"}]",
  QUOTA_USER_DAILY_MESSAGES: "7431",
  QUOTA_USER_DAILY_TOKENS: "743100",
  QUOTA_GLOBAL_DAILY_TOKENS: "7431000",
  STREAM_CANARY_TOKEN: "__CDOR_PRIVATE_CANARY_STREAM_TOKEN_7f42c9__"
});

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt"
]);

async function listTextFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTextFiles(absolutePath)));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

export async function findClientSecretLeaks(roots, needles) {
  const leaks = [];

  for (const root of roots) {
    const files = await listTextFiles(root);

    if (files.length === 0) {
      throw new Error(`No hay artefactos cliente analizables en ${root}`);
    }

    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const needle of needles) {
        if (content.includes(needle)) {
          leaks.push({ file, needle });
        }
      }
    }
  }

  return leaks;
}

function runBuild(repoRoot, script, environment) {
  const result = spawnSync("pnpm", [script], {
    cwd: repoRoot,
    env: environment,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${script} terminó con código ${result.status}`);
  }
}

export async function runClientSecretScan() {
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(scriptPath), "..");
  const buildEnvironment = {
    ...process.env,
    ...SECRET_CANARIES,
    ORIGIN: "https://build-canary.cdor.invalid",
    BETTER_AUTH_URL: "https://build-canary.cdor.invalid"
  };

  runBuild(repoRoot, "build:platform", buildEnvironment);
  runBuild(repoRoot, "build:mobile", buildEnvironment);

  const roots = [
    path.join(repoRoot, "apps/platform/.svelte-kit/output/client"),
    path.join(repoRoot, "apps/mobile/dist")
  ];
  const needles = [
    ...SENSITIVE_SERVER_NAMES,
    // Los valores puramente numéricos son de baja entropía y aparecen de
    // forma legítima en dependencias (por ejemplo, el alfabeto Base32 de ULID).
    // Sus nombres privados siguen formando parte del escaneo.
    ...Object.values(SECRET_CANARIES).filter(
      (value) => !/^\d+$/.test(value)
    )
  ];
  const leaks = await findClientSecretLeaks(roots, needles);

  if (leaks.length > 0) {
    for (const leak of leaks) {
      process.stderr.write(
        `Fuga cliente: ${path.relative(repoRoot, leak.file)} contiene ${leak.needle}\n`
      );
    }
    throw new Error(`Se detectaron ${leaks.length} fugas en bundles cliente`);
  }

  process.stdout.write(
    `Escaneo limpio: ${roots.length} bundles sin nombres ni valores privados\n`
  );
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runClientSecretScan().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
