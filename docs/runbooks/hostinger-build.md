# Build de Hostinger

## Runtime

- Node.js: 24.x, detectado mediante `.node-version` y `package.json#engines`.
- Package manager local: pnpm 11.3.0.
- Hostinger proporciona pnpm 11.4.0. El generador adapta `packageManager` y
  `engines.pnpm` a 11.4.0 en la copia que se entrega allí, porque Corepack no
  cambia de versión durante la instalación remota.
- Hostinger no conserva `pnpm` en `PATH` al ejecutar el build. La copia
  desplegable invoca el binario de Vite ya instalado mediante Node, sin un
  segundo proceso pnpm.
- El caché remoto puede restaurar binarios esbuild sin permiso de ejecución.
  La copia desplegable cambia `allowBuilds.esbuild` a `false` en
  `pnpm-workspace.yaml`; el build restablece `0755` únicamente sobre los
  archivos `*/bin/esbuild` antes de invocar Vite.
- Tras compilar `apps/platform`, `pnpm deploy --prod --legacy` crea `runtime/`
  con la salida de adapter-node y un `node_modules` de producción aislado.
  Hostinger publica `runtime/build/index.js`; no compila ni copia
  `apps/mobile` o `src-tauri`.
- Vite integra las dependencias de producción en el bundle SSR. El proceso
  puede arrancar únicamente con `build/`, incluso si el publicador de
  Hostinger omite un `node_modules` anidado en `output_directory`.
- El build reemplaza el lanzador genérico de adapter-node por una entrada
  mínima que sirve su `handler` sobre `HOST` y `PORT`. No depende de la
  activación de sockets `LISTEN_PID`/`LISTEN_FDS` del entorno de Hostinger.
- La salida conserva además `runtime/runtime/build/index.js` como copia de
  compatibilidad. Hostinger puede interpretar el archivo de entrada desde la
  raíz del repositorio o desde `output_directory`; ambas rutas arrancan el
  mismo artefacto sin depender de enlaces simbólicos.
- Puerto: el proceso de `@sveltejs/adapter-node` debe respetar `PORT`.

## Comandos

Desde la raíz del repositorio:

```bash
pnpm install --frozen-lockfile --filter @cdor/platform...
pnpm hostinger:build
pnpm hostinger:start
pnpm build:hostinger
./scripts/hostinger/create-platform-archive.sh
```

El comando de instalación se ejecuta directamente, no a través de un script
pnpm. El filtro `@cdor/platform...` incluye en el futuro solo sus paquetes
compartidos transitivos y no instala el subgrafo móvil.

No se deben configurar en Hostinger comandos Tauri, Cargo, Gradle, Android o
iOS. `apps/mobile` y `apps/mobile/src-tauri` se conservan en Git, pero no se
compilan allí.

El archivo generado parte de `HEAD`, exige un árbol limpio y contiene solo
`apps/platform` y sus contratos compartidos. La adaptación del manifiesto
ocurre dentro de un directorio temporal y no altera el repositorio.

## Despliegue automático desde GitHub

El workflow `Publish Hostinger source` se ejecuta únicamente cuando `Checks`
termina correctamente sobre `main`, genera el mismo árbol filtrado y reemplaza
la rama derivada `hostinger`. Esa rama no es una rama de desarrollo y nunca
debe editarse manualmente.

Hostinger debe conectarse al repositorio privado `M1KE-27/cdor.online` con:

- Rama: `hostinger`.
- Directorio raíz: `./`.
- Framework: `Other`.
- Node.js: `24.x`.
- Gestor de paquetes: `pnpm`.
- Comando de compilación: `pnpm run build:platform`.
- Directorio de salida: `runtime`.
- Archivo de entrada: `runtime/build/index.js`.

Los secretos se mantienen exclusivamente en las variables de entorno de
hPanel. El workflow no aplica migraciones, no contiene credenciales y no
despliega `apps/mobile` ni `src-tauri`.
