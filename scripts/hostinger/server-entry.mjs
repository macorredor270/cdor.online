import http from "node:http";
import process from "node:process";

const host = process.env.HOST || "0.0.0.0";
const rawPort = process.env.PORT || "3000";
const port = Number.parseInt(rawPort, 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

let applicationHandler;

const server = http.createServer((request, response) => {
  if (!applicationHandler) {
    response.writeHead(503, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8"
    });
    response.end(
      JSON.stringify({
        error: {
          code: "STARTUP_PENDING",
          message: "El servicio está iniciándose"
        }
      })
    );
    return;
  }

  Promise.resolve(applicationHandler(request, response)).catch((error) => {
    console.error("CDOR_REQUEST_FAILED", error);
    if (!response.headersSent) {
      response.writeHead(500, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8"
      });
    }
    response.end();
  });
});

server.listen(port, host, () => {
  process.stdout.write(`Listening on http://${host}:${port}\n`);

  void import("./handler.js")
    .then(({ handler }) => {
      applicationHandler = handler;
      process.stdout.write("CDOR handler ready\n");
    })
    .catch((error) => {
      console.error("CDOR_HANDLER_STARTUP_FAILED", error);
    });
});

function shutdown() {
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
