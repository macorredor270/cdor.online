const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;

  if (!value) {
    throw new Error("DATABASE_URL es obligatoria para este comando");
  }

  const url = new URL(value);
  if (url.protocol !== "mysql:" && url.protocol !== "mysql2:") {
    throw new Error("DATABASE_URL debe usar mysql:// o mysql2://");
  }
  if (!url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL debe incluir una base de datos");
  }

  return value;
}

export function assertSafeMigrationTarget(databaseUrl: string): void {
  const url = new URL(databaseUrl);

  if (LOCAL_HOSTS.has(url.hostname)) {
    return;
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const expected = `${url.hostname}/${databaseName}`;

  if (process.env.CDOR_CONFIRM_REMOTE_MIGRATION !== expected) {
    throw new Error(
      `Migración remota bloqueada. Confirma exactamente ${expected}`
    );
  }
}

export function describeDatabaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || "3306"}/${decodeURIComponent(
    url.pathname.slice(1)
  )}`;
}
