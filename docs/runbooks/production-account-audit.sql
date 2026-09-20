-- Auditoría y limpieza de cuentas en producción (u333974886_cdor).
--
-- Ejecutar en phpMyAdmin UN BLOQUE CADA VEZ, no los cuatro de golpe.
--
-- Las tablas van cualificadas con el nombre de la base a propósito: la primera
-- consulta lee `information_schema` y phpMyAdmin conserva ese contexto para la
-- siguiente, de modo que un `FROM user` a secas falla con
-- «#1109 Tabla desconocida 'user' en information_schema».
--
-- Los bloques 1 a 3 son de solo lectura. El 4 borra y va comentado.

-- ---------------------------------------------------------------------------
-- BLOQUE 1 · ¿Sigue existiendo la restricción UNIQUE sobre user.email?
--
-- Se espera una fila con INDEX_NAME = 'user_email_unique' y NON_UNIQUE = 0.
-- Si no aparece, el registro admitiría dos cuentas con el mismo correo.
-- ---------------------------------------------------------------------------
SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = 'u333974886_cdor'
   AND TABLE_NAME = 'user'
 ORDER BY INDEX_NAME;


-- ---------------------------------------------------------------------------
-- BLOQUE 2 · Duplicados reales. Es lo único que confirma daño.
--
-- Cero filas = no hay ninguna cuenta duplicada.
-- ---------------------------------------------------------------------------
SELECT email, COUNT(*) AS cuentas
  FROM `u333974886_cdor`.`user`
 GROUP BY email
HAVING COUNT(*) > 1;


-- ---------------------------------------------------------------------------
-- BLOQUE 3 · Inventario de cuentas y estado de verificación.
-- ---------------------------------------------------------------------------
SELECT id, email, email_verified, created_at
  FROM `u333974886_cdor`.`user`
 ORDER BY created_at DESC;


-- ---------------------------------------------------------------------------
-- BLOQUE 4 · Limpieza de las cuentas de prueba del diagnóstico.
--
-- Descomentar solo después de confirmar en el bloque 3 que son estas dos y no
-- otras. El borrado arrastra en cascada conversaciones, mensajes, memorias y
-- sesiones de esas cuentas.
--
-- NO incluye iam1ke@proton.me: esa es la cuenta real.
-- ---------------------------------------------------------------------------
-- DELETE FROM `u333974886_cdor`.`user`
--  WHERE email IN (
--    'probe-cdai-check@example.invalid',
--    'iam1ke+cdai013318@proton.me'
--  );


-- ---------------------------------------------------------------------------
-- BLOQUE 5 · ¿Están aplicadas las tres migraciones?
--
-- Se esperan 3 filas. Menos significa que producción va por detrás del
-- repositorio, y entonces puede faltar cualquier columna o índice posterior.
-- Esta es la comprobación de deriva que de verdad importa.
-- ---------------------------------------------------------------------------
SELECT id, FROM_UNIXTIME(created_at / 1000) AS aplicada
  FROM `u333974886_cdor`.`__cdor_migrations`
 ORDER BY created_at;


-- ---------------------------------------------------------------------------
-- BLOQUE 6 · Generaciones colgadas.
--
-- Una generación en 'streaming' de hace más de cinco minutos quedó huérfana:
-- su mensaje sigue sin contenido final y el usuario ve una respuesta a medias.
-- Cero filas es lo sano.
-- ---------------------------------------------------------------------------
SELECT id, state, created_at
  FROM `u333974886_cdor`.`generation_requests`
 WHERE state = 'streaming'
   AND created_at < NOW() - INTERVAL 5 MINUTE;


-- ---------------------------------------------------------------------------
-- BLOQUE 7 · Volumen real de datos.
--
-- Para saber qué hay que proteger antes de hablar de backups y de carga.
-- ---------------------------------------------------------------------------
SELECT 'cuentas' AS tabla, COUNT(*) AS filas FROM `u333974886_cdor`.`user`
UNION ALL SELECT 'conversaciones', COUNT(*) FROM `u333974886_cdor`.`conversations`
UNION ALL SELECT 'mensajes', COUNT(*) FROM `u333974886_cdor`.`messages`
UNION ALL SELECT 'memorias', COUNT(*) FROM `u333974886_cdor`.`memories`
UNION ALL SELECT 'sesiones', COUNT(*) FROM `u333974886_cdor`.`session`
UNION ALL SELECT 'cambios sync', COUNT(*) FROM `u333974886_cdor`.`sync_changes`;
