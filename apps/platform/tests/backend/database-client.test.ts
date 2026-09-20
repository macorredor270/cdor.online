import { describe, expect, it } from "vitest";
import {
  createDatabaseClient,
  databaseUriFromEnvironment
} from "../../src/lib/server/db/client";

describe("configuración del cliente MySQL", () => {
  it("usa los campos DB_* y fuerza IPv4 para localhost", () => {
    const uri = databaseUriFromEnvironment({
      DB_HOST: "localhost",
      DB_PORT: 3306,
      DB_POOL_LIMIT: 3,
      DB_NAME: "u333974886_cdor",
      DB_USER: "u333974886_cdorapp",
      DB_PASSWORD: "Special@Password#!!!",
      DATABASE_URL: "mysql://wrong:wrong@srv507.hstgr.io/wrong"
    });
    const parsed = new URL(uri);

    expect(parsed.hostname).toBe("127.0.0.1");
    expect(parsed.port).toBe("3306");
    expect(parsed.username).toBe("u333974886_cdorapp");
    expect(decodeURIComponent(parsed.password)).toBe("Special@Password#!!!");
    expect(parsed.pathname).toBe("/u333974886_cdor");
  });

  it("conserva intacto un host MySQL remoto", () => {
    const uri = databaseUriFromEnvironment({
      DB_HOST: "srv507.hstgr.io",
      DB_PORT: 3306,
      DB_POOL_LIMIT: 3,
      DB_NAME: "cdor",
      DB_USER: "cdorapp",
      DB_PASSWORD: "password",
      DATABASE_URL: "mysql://ignored:ignored@localhost/ignored"
    });

    expect(new URL(uri).hostname).toBe("srv507.hstgr.io");
  });

  it("limita a cinco segundos el handshake por defecto", async () => {
    const client = createDatabaseClient(
      "mysql://user:password@192.0.2.1/cdor",
      { connectionLimit: 1 }
    );

    const internalConfig = client.pool.pool.config as unknown as {
      connectionConfig: { connectTimeout: number };
    };
    expect(internalConfig.connectionConfig.connectTimeout).toBe(5_000);
    await client.close();
  });
});
