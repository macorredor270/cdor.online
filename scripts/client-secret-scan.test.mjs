import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  findClientSecretLeaks,
  SENSITIVE_SERVER_NAMES
} from "./scan-client-secrets.mjs";

let temporaryRoot;

before(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "cdor-secret-scan-"));
  await mkdir(path.join(temporaryRoot, "assets"));
});

after(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

test("acepta un bundle sin referencias privadas", async () => {
  await writeFile(
    path.join(temporaryRoot, "assets", "clean.js"),
    'console.log("cliente público");'
  );

  const leaks = await findClientSecretLeaks(
    [temporaryRoot],
    SENSITIVE_SERVER_NAMES
  );
  assert.deepEqual(leaks, []);
});

test("detecta el nombre de una variable privada", async () => {
  const leakingFile = path.join(temporaryRoot, "assets", "leak.js");
  await writeFile(leakingFile, 'console.log("NVIDIA_API_KEY");');

  const leaks = await findClientSecretLeaks(
    [temporaryRoot],
    SENSITIVE_SERVER_NAMES
  );
  assert.ok(
    leaks.some(
      (leak) =>
        leak.file === leakingFile && leak.needle === "NVIDIA_API_KEY"
    )
  );
});
