# Release iOS manual

GitHub Actions no compila ni firma IPA. `apps/mobile` y el plugin Keychain se
conservan en el repositorio, pero la preparación y firma se ejecutan fuera de
GitHub Actions en un Mac autorizado.

Requisitos:

- macOS con Xcode y Rust/Tauri configurados;
- Apple Developer, certificado y provisioning vigentes;
- secretos de firma únicamente en el llavero del Mac o en el sistema de
  distribución elegido, nunca en el repositorio ni en variables públicas.

Comandos base:

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/mobile tauri ios init
pnpm --dir apps/mobile tauri ios build --ci
```

La firma, subida y publicación requieren una revisión manual separada. No se
declara una release iOS hasta comprobar instalación, Keychain, rotación y
revocación de sesión en un dispositivo real.
