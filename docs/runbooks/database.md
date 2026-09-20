# Runbook de MySQL

## Desarrollo local

CDOR usa MySQL 8.4.8 en `127.0.0.1:3307` y una matriz de compatibilidad con
MariaDB 11.8.8 en `127.0.0.1:3308`, versión anunciada por Hostinger. El puerto
3306 no se toca.

```bash
source scripts/env.sh
pnpm db:local:up
pnpm db:check
pnpm db:migrate:test
pnpm test:db
pnpm db:compat:test
pnpm db:restore:test
pnpm db:explain
```

El contenedor persiste `cdor_dev` en un volumen propio. Las suites crean bases
con prefijo `cdor_test_` y solo eliminan ese scope.

## Generar una migración

1. Modificar el esquema Drizzle.
2. Ejecutar `pnpm db:generate`.
3. Revisar el SQL y snapshots.
4. Ejecutar todos los comandos del apartado local.
5. Confirmar que una segunda ejecución no genera cambios.

No se usa `drizzle-kit push`.

## Aplicar migraciones

`pnpm db:migrate` exige `DATABASE_URL`. Localhost se permite directamente. Un
host remoto requiere además:

```text
CDOR_CONFIRM_REMOTE_MIGRATION=<host>/<base>
```

La confirmación evita apuntar accidentalmente a producción; no sustituye
backup, revisión ni ventana de despliegue. La aplicación web y CI nunca
ejecutan migraciones al arrancar.

## Backup local

```bash
pnpm db:backup -- /ruta/privada/cdor.sql cdor_dev
```

El script usa `mysqldump --single-transaction`, no sobrescribe archivos y crea
el dump con permisos 0600. `backups/` está ignorado por Git.

## Hostinger antes de la primera migración

1. Rotar la contraseña que apareció en capturas.
2. Mantener Remote MySQL cerrado; nunca seleccionar “Cualquier host”.
3. Abrir phpMyAdmin desde hPanel y registrar el resultado de:

```sql
SELECT
  VERSION() AS version,
  @@version_comment AS version_comment,
  @@character_set_database AS character_set_database,
  @@collation_database AS collation_database,
  @@sql_mode AS sql_mode;
```

4. Comparar el resultado con las dos migraciones sin aplicarlas.
5. Exportar la base desde hPanel/phpMyAdmin.
6. Restaurar el dump en una base temporal y verificar tablas y un registro
   centinela.
7. Aplicar manualmente una sola vez con confirmación exacta.

El host externo mostrado por hPanel y el host accesible desde la aplicación
pueden diferir. Producción debe usar el valor verificado en el entorno de
Hostinger; no se publica ni se envía al cliente.

El runtime construye la conexión exclusivamente desde `DB_HOST`, `DB_PORT`,
`DB_NAME`, `DB_USER` y `DB_PASSWORD`. `DATABASE_URL` queda reservada para
scripts manuales de migración y administración. En el hosting asignado al
sitio, `DB_HOST=localhost` evita salir por Remote MySQL.

## Rollback

Las migraciones siguen expand/contract. Ante un fallo:

1. detener el despliegue;
2. volver a la versión de aplicación compatible;
3. restaurar el backup si hubo pérdida o transformación irreversible;
4. no improvisar un `DROP` en producción.

Las credenciales, dumps y salidas con datos privados no se adjuntan a issues ni
logs.
