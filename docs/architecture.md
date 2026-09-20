# Arquitectura

La arquitectura canónica está descrita en
[`../CDOR_PLAN_DEFINITIVO.md`](../CDOR_PLAN_DEFINITIVO.md).

Este milestone solo establece el monorepo y sus límites de compilación:

```text
apps/platform  -> SvelteKit/Node -> Hostinger
apps/mobile    -> Svelte/Tauri   -> Android/iOS
packages       -> contratos y código compartido
```

MySQL será la fuente de verdad y SQLite se limitará a caché y outbox móvil.
