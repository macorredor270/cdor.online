/**
 * Elimina cuentas de prueba concretas, indicadas por correo exacto.
 *
 * Nunca borra por patrón ni acepta comodines: una equivocación aquí destruye
 * datos reales. El borrado de `user` arrastra en cascada conversaciones,
 * mensajes, memorias, sesiones y el resto del contenido de esa cuenta.
 *
 * Uso:
 *   DATABASE_URL=... pnpm --dir apps/platform db:remove-test-accounts -- correo@dominio [...]
 *   Añadir --apply para ejecutar; sin él solo informa.
 */
import mysql from "mysql2/promise";

const args = process.argv.slice(2).filter((value) => value !== "--");
const apply = args.includes("--apply");
const emails = args.filter((value) => !value.startsWith("--"));

if (emails.length === 0) {
  console.error(
    "Uso: db:remove-test-accounts -- correo@dominio [otro@dominio] [--apply]"
  );
  process.exit(64);
}

const invalid = emails.filter((value) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));
if (invalid.length > 0) {
  console.error(`Correos no válidos: ${invalid.join(", ")}`);
  process.exit(64);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL es obligatoria");
  process.exit(64);
}

const connection = await mysql.createConnection(url);
try {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT id, email, name, created_at FROM user WHERE email IN (?)",
    [emails]
  );

  if (rows.length === 0) {
    console.log("No existe ninguna de esas cuentas. Nada que hacer.");
    process.exit(0);
  }

  console.log(`Coinciden ${rows.length} cuenta(s):`);
  for (const row of rows) {
    console.log(`  ${row.email}  id=${row.id}  creada=${row.created_at}`);
  }

  if (!apply) {
    console.log("\nSimulación. Repite con --apply para eliminarlas.");
    process.exit(0);
  }

  const [result] = await connection.query<mysql.ResultSetHeader>(
    "DELETE FROM user WHERE email IN (?)",
    [emails]
  );
  console.log(`\nEliminadas ${result.affectedRows} cuenta(s) y su contenido.`);
} finally {
  await connection.end();
}
