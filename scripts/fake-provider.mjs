#!/usr/bin/env node
// Local OpenAI-compatible fake provider for development without real API keys.
// Usage: node scripts/fake-provider.mjs [port]   (default 4010)
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? process.env.FAKE_PROVIDER_PORT ?? 4010);

const REPLY = [
  "¡Hola! Soy MAC en modo local de pruebas: ",
  "esta respuesta la genera un servidor falso, no un modelo real.\n\n",
  "| Función | Estado |\n| --- | --- |\n| Tablas | ✅ |\n| Streaming | ✅ |\n\n",
  "Para usar IA real, define una clave (`GROQ_API_KEY`, `GEMINI_API_KEY`…) en `.env`."
];

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && url.pathname.endsWith("/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: "fake-model", object: "model" }] }));
    return;
  }
  if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
    const body = JSON.parse((await readBody(req)) || "{}");
    const base = { id: "chatcmpl-fake", object: "chat.completion.chunk", model: "fake-model" };
    if (body.stream === false) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...base, object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: REPLY.join("") }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 40, total_tokens: 50 } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    for (const piece of REPLY) {
      send({ ...base, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] });
      await new Promise((r) => setTimeout(r, 250));
    }
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 40, total_tokens: 50 } });
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }
  res.writeHead(404).end();
}).listen(port, "127.0.0.1", () => console.log(`Proveedor falso en http://127.0.0.1:${port}/v1`));
