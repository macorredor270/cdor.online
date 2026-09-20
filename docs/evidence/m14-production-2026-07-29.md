# Evidencia M14 — 2026-07-29

## Despliegue público

Origen: `https://cdor.online` (Hostinger, rama `hostinger`).

| Comprobación | Resultado |
| --- | --- |
| `/health` | HTTP 200 |
| `/health/ready` | HTTP 200 |
| `/api/v1/conversations` sin sesión | HTTP 401 |
| HSTS, `nosniff`, `DENY`, Referrer Policy, Permissions Policy, COOP, CORP | presentes |
| páginas `/`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` | HTTP 200 |

## SSE

`pnpm --dir apps/platform smoke:stream:hostinger` completó correctamente:

```text
ticks=1198 elapsed_ms=300813 first_tick_ms=571 max_gap_ms=824 done=true
```

La canary es sintética: no llama a NVIDIA, no crea mensajes y no modifica
MySQL.

## Carga HTTP

`pnpm production:load` contra `/health`, con timeout de cliente de 10 segundos:

| Concurrencia | Peticiones | Resultado |
| ---: | ---: | --- |
| 10 | 50 | OK — P50 3173 ms, P95 6583 ms, P99 7581 ms |
| 25 | 50 | Bloqueada por `TimeoutError` |
| 50 | 50 | Bloqueada por `TimeoutError` |

Esto no demuestra capacidad de lanzamiento para 25/50 usuarios simultáneos.

## Base de datos

Se creó un backup remoto fuera del árbol publicado y se verificó su hash y
conteo de tablas. La restauración en una base temporal no pudo autenticarse
con el usuario temporal proporcionado por hPanel. No se ejecutaron migraciones
ni escrituras sobre `u333974886_cdor`.

## Decisión

M14 queda en estado **bloqueado para lanzamiento**. La aplicación está
desplegada y protegida, pero no se abre el registro público hasta resolver la
carga concurrente, una restauración remota verificable y las revisiones legal
e iOS indicadas en el documento rector.
