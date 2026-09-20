/**
 * Comprueba que la base apuntada por DATABASE_URL conserva las restricciones
 * que declaran las migraciones.
 *
 * Existe porque una restricción ausente no se nota hasta que ya hay datos
 * corruptos: sin UNIQUE sobre `user.email`, el registro admite dos cuentas con
 * el mismo correo y el login queda ambiguo. Es de solo lectura: consulta
 * `information_schema` y no modifica nada.
 */
import mysql from "mysql2/promise";

type Expectation = Readonly<{
  table: string;
  index: string;
  column: string;
  unique: boolean;
  why: string;
}>;

const EXPECTATIONS: readonly Expectation[] = Object.freeze([
  {
    table: "user",
    index: "user_email_unique",
    column: "email",
    unique: true,
    why: "sin él, dos cuentas pueden compartir correo y el login es ambiguo"
  },
  {
    table: "session",
    index: "PRIMARY",
    column: "id",
    unique: true,
    why: "clave primaria de sesión"
  },
  {
    table: "messages",
    index: "PRIMARY",
    column: "id",
    unique: true,
    why: "clave primaria de mensaje"
  }
]);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL es obligatoria");
  process.exit(64);
}

const connection = await mysql.createConnection(url);
try {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()`
  );

  let failures = 0;
  for (const expected of EXPECTATIONS) {
    const found = rows.find(
      (row) =>
        row.TABLE_NAME === expected.table &&
        row.INDEX_NAME === expected.index &&
        row.COLUMN_NAME === expected.column
    );
    const isUnique = found ? Number(found.NON_UNIQUE) === 0 : false;
    const ok = found !== undefined && isUnique === expected.unique;
    if (!ok) {
      failures += 1;
      console.error(
        `FALTA ${expected.table}.${expected.index} (${expected.column}): ${expected.why}`
      );
    } else {
      console.log(`correcto ${expected.table}.${expected.index}`);
    }
  }

  // Duplicados reales, que es lo único que confirma el daño.
  const [duplicates] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT email, COUNT(*) AS total
       FROM user
      GROUP BY email
     HAVING COUNT(*) > 1`
  );
  if (duplicates.length > 0) {
    failures += 1;
    console.error(`correos duplicados en 'user': ${duplicates.length}`);
    for (const row of duplicates) {
      console.error(`  ${row.email} -> ${row.total} cuentas`);
    }
  } else {
    console.log("correcto sin correos duplicados en 'user'");
  }

  if (failures > 0) {
    console.error(`\nEsquema con ${failures} problema(s).`);
    process.exit(1);
  }
  console.log("\nEsquema conforme a las migraciones.");
} finally {
  await connection.end();
}
