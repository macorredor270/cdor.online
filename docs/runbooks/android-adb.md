# Runbook Android mediante ADB

El único dispositivo autorizado para M11 es el Xiaomi:

```text
HQRSFUZXXOR4PN6L
```

Los scripts nunca seleccionan el primer dispositivo de `adb devices`. Requieren
el serial exacto y rechazan el Mi TV o cualquier otro equipo.

## Preparación

1. Conectar el Xiaomi por USB.
2. Desbloquearlo y aceptar la huella RSA de depuración.
3. Verificar:

```bash
adb devices -l
export ANDROID_SERIAL=HQRSFUZXXOR4PN6L
adb -s "$ANDROID_SERIAL" get-state
```

La salida debe contener `device`; `unauthorized` exige aceptar el diálogo en el
teléfono.

## Debug USB

```bash
export ANDROID_SERIAL=HQRSFUZXXOR4PN6L
./scripts/debug-xiaomi.sh
```

El script crea únicamente `adb reverse` para TCP 1420 y 1421, ejecuta Tauri
Android con el serial explícito y retira esos dos forwards al salir. No usa
`reverse --remove-all`, `pm clear` ni `uninstall`.

## Debug LAN

El PC y el Xiaomi deben estar en la misma red privada:

```bash
export ANDROID_SERIAL=HQRSFUZXXOR4PN6L
export CDOR_LAN_HOST=192.168.3.200
./scripts/debug-xiaomi-lan.sh
```

Si se omite `CDOR_LAN_HOST`, el script detecta la IPv4 de la ruta por defecto y
comprueba que pertenece a una interfaz local. Vite expone 1420 y HMR usa 1421.
No debe emplearse este modo en una red pública.

## Instalación y logs

```bash
export ANDROID_SERIAL=HQRSFUZXXOR4PN6L
adb -s "$ANDROID_SERIAL" install -r \
  apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb -s "$ANDROID_SERIAL" shell am start -n \
  online.cdor.app/.MainActivity
adb -s "$ANDROID_SERIAL" logcat -c
adb -s "$ANDROID_SERIAL" logcat |
  grep --line-buffered -Ei \
  'cdor|tauri|rust|chromium|AndroidRuntime|FATAL EXCEPTION'
```

Para revisar un crash ya ocurrido:

```bash
adb -s "$ANDROID_SERIAL" logcat -b crash -d
```

## Perfil release medible

La build release sale sin firma de distribución. Para medirla físicamente se
firma con el keystore debug local, que nunca se versiona y no sirve para
publicar:

```bash
source scripts/env.sh
pnpm --dir apps/mobile tauri android build \
  --apk --target aarch64 --ci
./scripts/sign-android-dev-release.sh
adb -s "$ANDROID_SERIAL" install -r \
  apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-dev-signed.apk
```

La firma de producción y sus secretos corresponden a M14.

## Matriz manual obligatoria

- abrir SQLite, cerrar forzosamente la app y reabrir la caché;
- guardar conversación y mensaje sin red;
- reactivar red y comprobar que el outbox converge sin duplicar;
- cambiar Wi-Fi/datos durante sync y streaming;
- iniciar y cancelar una generación;
- bloquear/desbloquear, rotar y reabrir desde recientes;
- repetir en build release y registrar memoria y frames.

La readiness `https://cdor.online/health/ready` debe responder 200 antes de
probar auth, sync o chat reales. Si responde 503 o expira, la prueba se detiene
sin sustituir MySQL por SQLite.

En este Xiaomi, Android puede bloquear la red de la aplicación cuando está
detrás del keyguard. Las pruebas técnicas de DNS, sync y streaming deben
ejecutarse con la aplicación visible y el teléfono desbloqueado. Esto no
autoriza a desactivar el PIN ni a introducirlo mediante ADB.

Si una prueba larga necesita mantener la pantalla encendida:

```bash
adb -s "$ANDROID_SERIAL" shell svc power stayon true
# ejecutar la prueba
adb -s "$ANDROID_SERIAL" shell svc power stayon false
```

El segundo comando es obligatorio al terminar.

## Medición

```bash
adb -s "$ANDROID_SERIAL" shell pidof online.cdor.app
adb -s "$ANDROID_SERIAL" shell dumpsys meminfo online.cdor.app
adb -s "$ANDROID_SERIAL" shell dumpsys gfxinfo \
  online.cdor.app framestats
```

No ejecutar `pm clear`: eliminaría la base SQLite y la sesión Keystore. Si se
necesita una prueba destructiva, debe autorizarse y respaldarse por separado.
